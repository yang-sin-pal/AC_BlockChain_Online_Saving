// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/access/Ownable2Step.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "../interfaces/ISavingCore.sol";
import "../interfaces/IVaultManager.sol";
import "../libraries/Errors.sol";
import "../libraries/Events.sol";
import "../libraries/InterestLib.sol";

/// @title SavingCore
/// @notice Business logic: saving plan, mở/rút/gia hạn deposit, mint NFT chứng chỉ.
/// @dev Ngày 1: chỉ dựng khung + logic quản lý plan. openDeposit/withdraw/renew làm ở Ngày 2-4.
contract SavingCore is ISavingCore, ERC721, Ownable2Step, ReentrancyGuard, Pausable {
    using SafeERC20 for IERC20;

    IERC20 public immutable usdc;
    IVaultManager public immutable vaultManager;
    uint256 public constant personalGracePeriod = 4; // days — personal variant (ID ending 38)
    uint256 public constant MAX_PENALTY_BPS = 3000; // 30% ceiling — must stay <= 10_000 to guarantee no underflow in earlyWithdraw

    // depositId => Deposit
    mapping(uint256 => Deposit) public deposits;
    uint256 public nextDepositId;

    // planId => Plan
    mapping(uint256 => Plan) public plans;
    uint256 public nextPlanId;

    // depositId => unpaid interest (C1: principal is always safe)
    mapping(uint256 => uint256) public pendingInterest;

    constructor(address _usdc, address _vaultManager)
        ERC721("Term Deposit Certificate", "TDC")
        Ownable(msg.sender)
    {
        usdc = IERC20(_usdc);
        vaultManager = IVaultManager(_vaultManager);
    }

    // ---------- Admin: quản lý plan ----------

    /// @notice Creates a new saving plan with the given parameters.
    /// @param tenorDays Term length in days.
    /// @param aprBps Annual interest rate in basis points (100 = 1%).
    /// @param minDeposit Minimum deposit amount. 0 = no limit.
    /// @param maxDeposit Maximum deposit amount. 0 = no limit.
    /// @param earlyWithdrawPenaltyBps Early withdrawal penalty in basis points.
    /// @return planId ID of the newly created plan.
    function createPlan(
        uint256 tenorDays,
        uint256 aprBps,
        uint256 minDeposit,
        uint256 maxDeposit,
        uint256 earlyWithdrawPenaltyBps
    ) external onlyOwner returns (uint256 planId) {
        if (tenorDays == 0) revert SavingCore_InvalidTenor();
        if (aprBps == 0) revert SavingCore_InvalidApr();
        if (minDeposit != 0 && maxDeposit != 0 && minDeposit > maxDeposit)
            revert SavingCore_InvalidDepositRange();
        if (earlyWithdrawPenaltyBps > MAX_PENALTY_BPS) revert SavingCore_InvalidPenalty();

        planId = nextPlanId++;
        plans[planId] = Plan({
            tenorDays: uint32(tenorDays),
            aprBps: uint16(aprBps),
            earlyWithdrawPenaltyBps: uint16(earlyWithdrawPenaltyBps),
            enabled: true,
            minDeposit: minDeposit,
            maxDeposit: maxDeposit
        });
        emit Events.PlanCreated(planId, tenorDays, aprBps);
    }

    /// @notice Updates the APR of a plan. Does not affect previously opened deposits.
    /// @param planId ID of the plan to update.
    /// @param newAprBps New APR in basis points.
    function updatePlan(uint256 planId, uint256 newAprBps) external onlyOwner {
        if (planId >= nextPlanId) revert SavingCore_PlanNotFound();
        // Chỉ đổi APR cho deposit MỚI — deposit cũ đã snapshot APR nên không bị ảnh hưởng.
        plans[planId].aprBps = uint16(newAprBps);
        emit Events.PlanUpdated(planId, newAprBps);
    }

    /// @notice Enables a plan to allow new deposits.
    /// @param planId ID of the plan to enable.
    function enablePlan(uint256 planId) external onlyOwner {
        if (planId >= nextPlanId) revert SavingCore_PlanNotFound();
        plans[planId].enabled = true;
        emit Events.PlanEnabled(planId);
    }

    /// @notice Disables a plan to block new deposits. Existing active deposits remain unaffected.
    /// @param planId ID of the plan to disable.
    function disablePlan(uint256 planId) external onlyOwner {
        if (planId >= nextPlanId) revert SavingCore_PlanNotFound();
        plans[planId].enabled = false;
        emit Events.PlanDisabled(planId);
    }

    /// @notice Emergency pause — blocks withdrawals and renewals.
    function pause() external onlyOwner {
        _pause();
    }

    /// @notice Resumes operations after a pause.
    function unpause() external onlyOwner {
        _unpause();
    }

    // ---------- Internal: deposit factory ----------

    /// @notice Creates a deposit record and mints the NFT certificate.
    /// @dev Shared by openDeposit, renewDeposit, and autoRenewDeposit.
    ///      Does NOT handle token transfers — caller is responsible for funding.
    /// @param planId ID of the plan this deposit follows.
    /// @param principal Deposit amount in USDC units.
    /// @param aprBps Annual rate to snapshot (from plan or old deposit).
    /// @param penaltyBps Penalty rate to snapshot (from plan or old deposit).
    /// @param tenorDays Term length in days.
    /// @return depositId ID of the newly created deposit.
    function _createDeposit(
        address to,
        uint256 planId,
        uint256 principal,
        uint16 aprBps,
        uint16 penaltyBps,
        uint32 tenorDays
    ) internal returns (uint256) {
        Plan storage plan = plans[planId];
        if (principal < plan.minDeposit) revert SavingCore_DepositBelowMin();
        if (principal > plan.maxDeposit) revert SavingCore_DepositAboveMax();

        uint256 depositId = nextDepositId++;
        uint64 start_ = uint64(block.timestamp);
        uint64 maturity_ = uint64(block.timestamp + uint256(tenorDays) * 86400);

        deposits[depositId] = Deposit({
            planId: planId,
            principal: principal,
            startAt: start_,
            maturityAt: maturity_,
            aprBpsAtOpen: aprBps,
            penaltyBpsAtOpen: penaltyBps,
            status: Status.Active,
            interestClaimed: false
        });

        _safeMint(to, depositId);
        return depositId;
    }

    // ---------- Internal helpers ----------

    /// @notice Calculates interest for a deposit using snapshotted APR and plan tenor.
    /// @dev Pure delegation to InterestLib — no storage writes, no external calls.
    /// @param depositId ID of the deposit to calculate interest for.
    /// @return Interest in USDC units.
    function _calcInterest(uint256 depositId) internal view returns (uint256) {
        Deposit storage d = deposits[depositId];
        return InterestLib.calculateInterest(d.principal, d.aprBpsAtOpen, plans[d.planId].tenorDays);
    }

    /// @notice Collects remaining principal and interest for a renewal.
    /// @dev Pulls interest from vault into SavingCore via payInterest. Caller must
    ///      settle status and mint the new deposit after this call (CEI order).
    ///      Blocked when paused — vault interaction requires system to be live.
    /// @param depositId ID of the deposit being renewed.
    /// @return newPrincipal Total principal for the new deposit (remaining principal + interest).
    function _collectRenewalPrincipal(uint256 depositId) internal whenNotPaused returns (uint256 newPrincipal) {
        Deposit storage d = deposits[depositId];

        // Principal contribution
        if (d.status != Status.PrincipalClaimed) {
            newPrincipal += d.principal;
        }

        // Interest contribution
        if (!d.interestClaimed) {
            uint256 interest;
            if (d.status == Status.PrincipalClaimed) {
                interest = pendingInterest[depositId];
                pendingInterest[depositId] = 0;
            } else {
                interest = _calcInterest(depositId);
            }
            if (interest > 0) {
                vaultManager.payInterest(address(this), interest);
            }
            newPrincipal += interest;
        }

        if (newPrincipal == 0) revert SavingCore_AlreadyWithdrawn();
    }

    // ---------- Modifiers ----------

    /// @dev Verifies caller is the NFT owner of the given deposit.
    modifier onlyDepositOwner(uint256 depositId) {
        if (msg.sender != ownerOf(depositId)) revert SavingCore_NotOwner();
        _;
    }

    // ---------- User functions ----------

    /// @notice Opens a new term deposit for the given plan.
    /// @dev User must approve SavingCore to spend USDC before calling.
    /// @param planId ID of the saving plan.
    /// @param amount Deposit amount (must be within plan's min/max range).
    /// @return depositId ID of the newly created deposit.
    function openDeposit(uint256 planId, uint256 amount)
        external
        nonReentrant
        override
        returns (uint256)
    {
        if (planId >= nextPlanId) revert SavingCore_PlanNotFound();
        Plan storage plan = plans[planId];
        if (!plan.enabled) revert SavingCore_PlanNotEnabled();
        if (amount == 0) revert SavingCore_ZeroAmount();
        if (plan.minDeposit != 0 && amount < plan.minDeposit)
            revert SavingCore_DepositBelowMin();
        if (plan.maxDeposit != 0 && amount > plan.maxDeposit)
            revert SavingCore_DepositAboveMax();

        usdc.safeTransferFrom(msg.sender, address(this), amount);
        uint256 depositId = _createDeposit(msg.sender, planId, amount, plan.aprBps, plan.earlyWithdrawPenaltyBps, plan.tenorDays);

        uint256 maturity_ = uint256(block.timestamp) + uint256(plan.tenorDays) * 86400;
        emit Events.DepositOpened(depositId, msg.sender, planId, amount, maturity_, plan.aprBps);

        return depositId;
    }

    /// @notice Withdraws principal + interest at or after maturity.
    /// @dev Caller must be the NFT owner. Only works when neither principal nor interest
    ///      has been claimed yet. For partial claims, use claimPrincipal or claimInterest.
    /// @param depositId ID of the deposit to withdraw.
    function withdrawAtMaturity(uint256 depositId) external nonReentrant whenNotPaused onlyDepositOwner(depositId) override {
        Deposit storage deposit = deposits[depositId];

        if (deposit.status == Status.PrincipalClaimed) revert SavingCore_UseClaimInterest();
        if (deposit.status != Status.Active) revert SavingCore_AlreadyWithdrawn();
        if (deposit.interestClaimed) revert SavingCore_UseClaimPrincipal();
        // Design Q5: >= boundary — at the exact maturity second, withdrawal is allowed
        if (block.timestamp < deposit.maturityAt) revert SavingCore_NotYetMature();
        if (block.timestamp >= uint256(deposit.maturityAt) + personalGracePeriod * 86400) revert SavingCore_PastGracePeriod();

        uint256 principal = deposit.principal;
        uint256 interest = _calcInterest(depositId);

        // CEI: update state BEFORE external calls (code-convention.md §7)
        deposits[depositId].status = Status.Withdrawn;

        usdc.safeTransfer(msg.sender, principal);
        vaultManager.payInterest(msg.sender, interest);

        emit Events.Withdrawn(depositId, msg.sender, principal, interest, false);
    }

    /// @notice Claims principal at maturity without depending on vault balance.
    /// @dev C1: for use when the system is paused or the vault is empty.
    ///      Principal is always paid from SavingCore's own balance.
    ///      Interest is calculated and stored as pendingInterest — claim via claimInterest.
    ///      No whenNotPaused — user can always get their principal back.
    /// @param depositId ID of the matured deposit.
    function claimPrincipal(uint256 depositId) external nonReentrant onlyDepositOwner(depositId) {
        Deposit storage deposit = deposits[depositId];

        if (deposit.status == Status.PrincipalClaimed) revert SavingCore_PrincipalAlreadyClaimed();
        if (deposit.status != Status.Active) revert SavingCore_AlreadyWithdrawn();
        if (block.timestamp < deposit.maturityAt) revert SavingCore_NotYetMature();

        uint256 principal = deposit.principal;

        // CEI: update state BEFORE external calls
        if (deposit.interestClaimed) {
            // Interest already claimed — both done → terminal
            deposits[depositId].status = Status.Withdrawn;
        } else {
            // Interest not yet claimed → store as pending, status = PrincipalClaimed
            uint256 interest = _calcInterest(depositId);
            pendingInterest[depositId] = interest;
            deposits[depositId].status = Status.PrincipalClaimed;
        }

        usdc.safeTransfer(msg.sender, principal);

        emit Events.Withdrawn(depositId, msg.sender, principal, 0, false);
    }

    /// @notice Claims interest from a deposit.
    /// @dev Two paths:
    ///      - Active & mature & not yet claimed: calculates interest, pays from vault.
    ///      - PrincipalClaimed: pays remaining pendingInterest from vault.
    ///      Supports partial vault payment — remainder stored as pendingInterest for retry.
    ///      Blocked when paused — defers interest payment until system resumes.
    /// @param depositId ID of the deposit to claim interest from.
    function claimInterest(uint256 depositId) external nonReentrant whenNotPaused onlyDepositOwner(depositId) {
        Deposit storage deposit = deposits[depositId];

        if (deposit.interestClaimed) revert SavingCore_InterestAlreadyClaimed();

        uint256 amount;

        if (deposit.status == Status.Active) {
            // Path A: interest not yet claimed, calculate from vault
            if (block.timestamp < deposit.maturityAt) revert SavingCore_NotYetMature();
            amount = _calcInterest(depositId);
        } else if (deposit.status == Status.PrincipalClaimed) {
            // Path B: principal already claimed, pay from pending
            amount = pendingInterest[depositId];
            if (amount == 0) revert SavingCore_NoPendingInterest();
            pendingInterest[depositId] = 0;
        } else {
            revert SavingCore_AlreadyWithdrawn();
        }

        // CEI: state before vault call
        uint256 vaultBal = vaultManager.vaultBalance();
        uint256 payAmount = vaultBal >= amount ? amount : vaultBal;
        uint256 remainder = amount - payAmount;

        pendingInterest[depositId] = remainder;

        if (remainder == 0) {
            deposit.interestClaimed = true;
            if (deposit.status == Status.PrincipalClaimed) {
                deposit.status = Status.Withdrawn;
            }
        }

        // Interactions
        if (payAmount > 0) {
            vaultManager.payInterest(msg.sender, payAmount);
        }

        emit Events.InterestClaimed(depositId, msg.sender, payAmount);
    }

    /// @notice Early withdrawal — no interest, penalty deducted from principal.
    /// @dev Caller must be the NFT owner. Penalty is sent to feeReceiver, not the vault.
    ///      Principal minus penalty is returned from SavingCore's own balance.
    /// @param depositId ID of the deposit to withdraw early.
    function earlyWithdraw(uint256 depositId) external nonReentrant onlyDepositOwner(depositId) override {
        Deposit storage deposit = deposits[depositId];

        if (deposit.status != Status.Active) revert SavingCore_AlreadyWithdrawn();
        if (vaultManager.feeReceiver() == address(0)) revert SavingCore_FeeReceiverNotSet();

        uint256 principal = deposit.principal;
        uint256 penalty = (principal * deposit.penaltyBpsAtOpen) / 10_000;
        uint256 userAmount = principal - penalty;

        // CEI: update state before external calls
        deposit.status = Status.Withdrawn;

        address feeReceiver_ = vaultManager.feeReceiver();
        usdc.safeTransfer(msg.sender, userAmount);
        usdc.safeTransfer(feeReceiver_, penalty);

        emit Events.Withdrawn(depositId, msg.sender, principal, 0, true);
    }

    /// @notice Manually renews a matured deposit into a new plan.
    /// @dev Only callable by the NFT owner. Allows renewal when principal or interest
    ///      has been partially claimed — compounds whatever remains.
    ///      The new plan's rate and tenor apply.
    /// @param depositId ID of the old deposit.
    /// @param newPlanId ID of the new plan to renew into.
    /// @return newDepositId ID of the newly minted deposit.
    function renewDeposit(uint256 depositId, uint256 newPlanId)
        external
        nonReentrant
        whenNotPaused
        onlyDepositOwner(depositId)
        override
        returns (uint256)
    {
        Deposit storage oldDeposit = deposits[depositId];

        if (oldDeposit.status == Status.Withdrawn ||
            oldDeposit.status == Status.ManualRenewed ||
            oldDeposit.status == Status.AutoRenewed) revert SavingCore_AlreadyWithdrawn();
        // Same >= boundary as withdrawAtMaturity (Design Q5)
        if (block.timestamp < oldDeposit.maturityAt) revert SavingCore_NotYetMature();
        if (block.timestamp >= uint256(oldDeposit.maturityAt) + personalGracePeriod * 86400) revert SavingCore_PastGracePeriod();

        // New plan validation
        if (newPlanId >= nextPlanId) revert SavingCore_PlanNotFound();
        if (!plans[newPlanId].enabled) revert SavingCore_PlanNotEnabled();

        uint256 newPrincipal = _collectRenewalPrincipal(depositId);

        // CEI: update old deposit status BEFORE external calls
        deposits[depositId].status = Status.ManualRenewed;

        // Mint new deposit with NEW plan's parameters
        Plan storage newPlan = plans[newPlanId];
        uint256 newDepositId = _createDeposit(
            msg.sender,
            newPlanId,
            newPrincipal,
            newPlan.aprBps,
            newPlan.earlyWithdrawPenaltyBps,
            newPlan.tenorDays
        );

        emit Events.Renewed(depositId, newDepositId, newPrincipal, newPlanId);

        return newDepositId;
    }

    /// @notice Auto-renews a matured deposit after the grace period has elapsed.
    /// @dev Can be called by anyone (bot or user). Allows renewal when principal or interest
    ///      has been partially claimed — compounds whatever remains.
    ///      APR is locked to the original aprBpsAtOpen (BR-15).
    /// @param depositId ID of the deposit to auto-renew.
    /// @return newDepositId ID of the newly minted deposit.
    function autoRenewDeposit(uint256 depositId) external nonReentrant whenNotPaused override returns (uint256) {
        Deposit storage oldDeposit = deposits[depositId];

        // No owner check — anyone can trigger auto-renew (§3.5: "A bot calls this")
        if (oldDeposit.status == Status.Withdrawn ||
            oldDeposit.status == Status.ManualRenewed ||
            oldDeposit.status == Status.AutoRenewed) revert SavingCore_AlreadyWithdrawn();

        // Grace period: maturityAt + 4 days (personal variant)
        uint256 gracePeriodEnd = uint256(oldDeposit.maturityAt) + uint256(personalGracePeriod) * 86400;
        if (block.timestamp < gracePeriodEnd) revert SavingCore_GracePeriodNotElapsed();

        uint256 newPrincipal = _collectRenewalPrincipal(depositId);

        // CEI: update old deposit status BEFORE external calls
        deposits[depositId].status = Status.AutoRenewed;

        // Mint new deposit with same plan (same tenor + locked APR) — preserve original owner
        uint256 newDepositId = _createDeposit(
            ownerOf(depositId),
            oldDeposit.planId,
            newPrincipal,
            oldDeposit.aprBpsAtOpen,
            oldDeposit.penaltyBpsAtOpen,
            plans[oldDeposit.planId].tenorDays
        );

        emit Events.Renewed(depositId, newDepositId, newPrincipal, oldDeposit.planId);

        return newDepositId;
    }
}
