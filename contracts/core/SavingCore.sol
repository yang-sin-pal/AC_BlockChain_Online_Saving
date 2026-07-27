// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

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

    /// @dev Prevents burning the NFT while there is pending interest to claim (C1).
    function _update(address to, uint256 tokenId, address auth) internal virtual override returns (address) {
        if (to == address(0) && pendingInterest[tokenId] > 0) {
            revert SavingCore_PendingInterestExists();
        }
        return super._update(to, tokenId, auth);
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

    // ---------- Internal helpers ----------

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
        uint256 planId,
        uint256 principal,
        uint16 aprBps,
        uint16 penaltyBps,
        uint32 tenorDays
    ) internal returns (uint256) {
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
            status: Status.Active
        });

        _safeMint(msg.sender, depositId);
        return depositId;
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
        uint256 depositId = _createDeposit(planId, amount, plan.aprBps, plan.earlyWithdrawPenaltyBps, plan.tenorDays);

        uint256 maturity_ = uint256(block.timestamp) + uint256(plan.tenorDays) * 86400;
        emit Events.DepositOpened(depositId, msg.sender, planId, amount, maturity_, plan.aprBps);

        return depositId;
    }

    /// @notice Withdraws principal + interest at or after maturity.
    /// @dev Caller must be the NFT owner. Interest is paid from the vault.
    ///      Principal is returned from SavingCore's own balance.
    /// @param depositId ID of the deposit to withdraw.
    function withdrawAtMaturity(uint256 depositId) external nonReentrant whenNotPaused override {
        Deposit storage deposit = deposits[depositId];

        if (msg.sender != ownerOf(depositId)) revert SavingCore_NotOwner();
        if (deposit.status != Status.Active) revert SavingCore_AlreadyWithdrawn();
        // Design Q5: >= boundary — at the exact maturity second, withdrawal is allowed
        if (block.timestamp < deposit.maturityAt) revert SavingCore_NotYetMature();

        uint256 principal = deposit.principal;
        // Interest uses snapshotted APR from deposit open time (BR-04)
        uint256 interest = InterestLib.calculateInterest(
            principal,
            deposit.aprBpsAtOpen,
            plans[deposit.planId].tenorDays
        );

        // CEI: update state BEFORE external calls (code-convention.md §7)
        deposit.status = Status.Withdrawn;

        // Principal from SavingCore balance; interest from vault (architecture separation)
        usdc.safeTransfer(msg.sender, principal);
        vaultManager.payInterest(msg.sender, interest);

        emit Events.Withdrawn(depositId, msg.sender, principal, interest, false);
    }

    /// @notice Claims principal at maturity without depending on vault balance.
    /// @dev C1: for use when the system is paused or the vault is empty.
    ///      Interest is recorded as pending and can be claimed later via claimInterest.
    ///      No whenNotPaused — user can always get their principal back.
    /// @param depositId ID of the matured deposit.
    function claimPrincipal(uint256 depositId) external nonReentrant {
        Deposit storage deposit = deposits[depositId];

        if (msg.sender != ownerOf(depositId)) revert SavingCore_NotOwner();
        if (deposit.status != Status.Active) revert SavingCore_AlreadyWithdrawn();
        if (block.timestamp < deposit.maturityAt) revert SavingCore_NotYetMature();

        uint256 principal = deposit.principal;
        uint256 interest = InterestLib.calculateInterest(
            principal, deposit.aprBpsAtOpen, plans[deposit.planId].tenorDays
        );

        // CEI: update state BEFORE external calls
        deposit.status = Status.PrincipalClaimed;

        // 1. Principal ALWAYS paid from SavingCore balance
        usdc.safeTransfer(msg.sender, principal);

        // 2. Interest: pay from vault if possible, record remainder as pending
        uint256 vaultBal = vaultManager.vaultBalance();
        if (vaultBal >= interest) {
            vaultManager.payInterest(msg.sender, interest);
        } else if (vaultBal > 0) {
            vaultManager.payInterest(msg.sender, vaultBal);
            pendingInterest[depositId] = interest - vaultBal;
        } else {
            pendingInterest[depositId] = interest;
        }

        emit Events.Withdrawn(depositId, msg.sender, principal, interest, false);
    }

    /// @notice Claims interest from a deposit.
    /// @dev Two paths:
    ///      - Active & mature: pays full interest from vault, sets status to InterestClaimed.
    ///      - Non-Active (e.g. after claimPrincipal): pays remaining pendingInterest from vault.
    ///      No whenNotPaused — user can claim even when paused.
    /// @param depositId ID of the deposit to claim interest from.
    function claimInterest(uint256 depositId) external nonReentrant {
        Deposit storage deposit = deposits[depositId];

        if (msg.sender != ownerOf(depositId)) revert SavingCore_NotOwner();

        uint256 amount;

        if (deposit.status == Status.Active) {
            // Path A: full interest claim at maturity — principal stays in SavingCore
            if (block.timestamp < deposit.maturityAt) revert SavingCore_NotYetMature();

            amount = InterestLib.calculateInterest(
                deposit.principal, deposit.aprBpsAtOpen, plans[deposit.planId].tenorDays
            );

            // CEI: update state BEFORE external calls
            deposit.status = Status.InterestClaimed;
        } else {
            // Path B: pending interest from a previous partial withdrawal (C1)
            amount = pendingInterest[depositId];
            if (amount == 0) revert SavingCore_NoPendingInterest();
            pendingInterest[depositId] = 0;
        }

        vaultManager.payInterest(msg.sender, amount);

        emit Events.InterestClaimed(depositId, msg.sender, amount);
    }

    /// @notice Burns the deposit NFT certificate.
    /// @dev Only callable after the deposit is withdrawn. Blocked if pending interest exists.
    /// @param depositId ID of the deposit whose NFT to burn.
    function burn(uint256 depositId) external {
        if (msg.sender != ownerOf(depositId)) revert SavingCore_NotOwner();
        if (deposits[depositId].status == Status.Active) revert SavingCore_AlreadyWithdrawn();
        _burn(depositId);
    }

    /// @notice Early withdrawal — no interest, penalty deducted from principal.
    /// @dev Caller must be the NFT owner. Penalty is sent to feeReceiver, not the vault.
    ///      Principal minus penalty is returned from SavingCore's own balance.
    /// @param depositId ID of the deposit to withdraw early.
    function earlyWithdraw(uint256 depositId) external nonReentrant whenNotPaused override {
        Deposit storage deposit = deposits[depositId];

        if (msg.sender != ownerOf(depositId)) revert SavingCore_NotOwner();
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
    /// @dev Only callable by the NFT owner. Interest is compounded from the vault
    ///      into the new deposit. The new plan's rate and tenor apply.
    /// @param depositId ID of the old deposit.
    /// @param newPlanId ID of the new plan to renew into.
    /// @return newDepositId ID of the newly minted deposit.
    function renewDeposit(uint256 depositId, uint256 newPlanId)
        external
        nonReentrant
        whenNotPaused
        override
        returns (uint256)
    {
        Deposit storage oldDeposit = deposits[depositId];

        // Only NFT owner can renew (BR-06)
        if (msg.sender != ownerOf(depositId)) revert SavingCore_NotOwner();
        if (oldDeposit.status != Status.Active && oldDeposit.status != Status.InterestClaimed)
            revert SavingCore_AlreadyWithdrawn();
        // Same >= boundary as withdrawAtMaturity (Design Q5)
        if (block.timestamp < oldDeposit.maturityAt) revert SavingCore_NotYetMature();

        // New plan validation
        if (newPlanId >= nextPlanId) revert SavingCore_PlanNotFound();
        if (!plans[newPlanId].enabled) revert SavingCore_PlanNotEnabled();

        // Interest uses snapshotted APR from old deposit (BR-04)
        uint32 oldTenorDays = plans[oldDeposit.planId].tenorDays;
        uint256 newPrincipal;

        if (oldDeposit.status == Status.InterestClaimed) {
            // Interest already paid out — principal stays in SavingCore, no vault call
            newPrincipal = oldDeposit.principal;
        } else {
            // Active: compound principal + interest from vault
            uint256 interest = InterestLib.calculateInterest(
                oldDeposit.principal,
                oldDeposit.aprBpsAtOpen,
                oldTenorDays
            );
            newPrincipal = oldDeposit.principal + interest;
            vaultManager.payInterest(address(this), interest);
        }

        // CEI: update old deposit status BEFORE external calls
        oldDeposit.status = Status.ManualRenewed;

        // Mint new deposit with NEW plan's parameters
        Plan storage newPlan = plans[newPlanId];
        uint256 newDepositId = _createDeposit(
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
    /// @dev Can be called by anyone (bot or user). Interest is compounded from the vault
    ///      into the new deposit. APR is locked to the original aprBpsAtOpen (BR-15).
    /// @param depositId ID of the deposit to auto-renew.
    /// @return newDepositId ID of the newly minted deposit.
    function autoRenewDeposit(uint256 depositId) external nonReentrant whenNotPaused override returns (uint256) {
        Deposit storage oldDeposit = deposits[depositId];

        // No owner check — anyone can trigger auto-renew (§3.5: "A bot calls this")
        if (oldDeposit.status != Status.Active) revert SavingCore_AlreadyWithdrawn();

        // Grace period: maturityAt + 4 days (personal variant)
        uint256 gracePeriodEnd = uint256(oldDeposit.maturityAt) + uint256(personalGracePeriod) * 86400;
        if (block.timestamp < gracePeriodEnd) revert SavingCore_GracePeriodNotElapsed();

        // Interest uses snapshotted APR from old deposit (BR-15) — NOT current plan APR
        uint32 oldTenorDays = plans[oldDeposit.planId].tenorDays;
        uint256 interest = InterestLib.calculateInterest(
            oldDeposit.principal,
            oldDeposit.aprBpsAtOpen,
            oldTenorDays
        );

        // Compound: new principal = old principal + interest
        uint256 newPrincipal = oldDeposit.principal + interest;

        // CEI: update old deposit status BEFORE external calls
        oldDeposit.status = Status.AutoRenewed;

        // Vault pays interest to SavingCore (compound — tokens stay in SavingCore)
        vaultManager.payInterest(address(this), interest);

        // Mint new deposit with same plan (same tenor + locked APR)
        uint256 newDepositId = _createDeposit(
            oldDeposit.planId,
            newPrincipal,
            oldDeposit.aprBpsAtOpen,
            oldDeposit.penaltyBpsAtOpen,
            oldTenorDays
        );

        emit Events.Renewed(depositId, newDepositId, newPrincipal, oldDeposit.planId);

        return newDepositId;
    }
}
