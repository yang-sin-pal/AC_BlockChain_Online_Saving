// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/access/Ownable2Step.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
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
contract SavingCore is ISavingCore, ERC721, Ownable2Step, ReentrancyGuard {
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

        uint256 depositId = nextDepositId++;
        uint64 start_ = uint64(block.timestamp);
        uint64 maturity_ = uint64(block.timestamp + uint256(plan.tenorDays) * 86400);

        deposits[depositId] = Deposit({
            planId: planId,
            principal: amount,
            startAt: start_,
            maturityAt: maturity_,
            aprBpsAtOpen: plan.aprBps,
            penaltyBpsAtOpen: plan.earlyWithdrawPenaltyBps,
            status: Status.Active
        });

        usdc.safeTransferFrom(msg.sender, address(this), amount);
        _safeMint(msg.sender, depositId);

        emit Events.DepositOpened(depositId, msg.sender, planId, amount, maturity_, plan.aprBps);

        return depositId;
    }

    /// @notice Withdraws principal + interest at or after maturity.
    /// @dev Caller must be the NFT owner. Interest is paid from the vault.
    ///      Principal is returned from SavingCore's own balance.
    /// @param depositId ID of the deposit to withdraw.
    function withdrawAtMaturity(uint256 depositId) external nonReentrant override {
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

    /// @notice Early withdrawal — no interest, penalty deducted from principal.
    /// @dev Caller must be the NFT owner. Penalty is sent to feeReceiver, not the vault.
    ///      Principal minus penalty is returned from SavingCore's own balance.
    /// @param depositId ID of the deposit to withdraw early.
    function earlyWithdraw(uint256 depositId) external nonReentrant override {
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

    function renewDeposit(uint256 /*depositId*/, uint256 /*newPlanId*/)
        external
        pure
        override
        returns (uint256)
    {
        revert("TODO: implement Day 4");
    }

    /// @notice Auto-renews a matured deposit after the grace period has elapsed.
    /// @dev Can be called by anyone (bot or user). Interest is compounded from the vault
    ///      into the new deposit. APR is locked to the original aprBpsAtOpen (BR-15).
    /// @param depositId ID of the deposit to auto-renew.
    /// @return newDepositId ID of the newly minted deposit.
    function autoRenewDeposit(uint256 depositId) external nonReentrant override returns (uint256) {
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
        uint256 newDepositId = nextDepositId++;
        uint64 newStart = uint64(block.timestamp);
        uint64 newMaturity = uint64(block.timestamp + uint256(oldTenorDays) * 86400);

        deposits[newDepositId] = Deposit({
            planId: oldDeposit.planId,
            principal: newPrincipal,
            startAt: newStart,
            maturityAt: newMaturity,
            aprBpsAtOpen: oldDeposit.aprBpsAtOpen,
            penaltyBpsAtOpen: oldDeposit.penaltyBpsAtOpen,
            status: Status.Active
        });

        _safeMint(msg.sender, newDepositId);

        emit Events.Renewed(depositId, newDepositId, newPrincipal, oldDeposit.planId);

        return newDepositId;
    }
}
