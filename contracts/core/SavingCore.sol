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

/// @title SavingCore
/// @notice Business logic: saving plan, mở/rút/gia hạn deposit, mint NFT chứng chỉ.
/// @dev Ngày 1: chỉ dựng khung + logic quản lý plan. openDeposit/withdraw/renew làm ở Ngày 2-4.
contract SavingCore is ISavingCore, ERC721, Ownable2Step, ReentrancyGuard {
    using SafeERC20 for IERC20;

    IERC20 public immutable usdc;
    IVaultManager public immutable vaultManager;

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

    // ---------- User functions: làm từ Ngày 2 ----------

    function openDeposit(uint256 /*planId*/, uint256 /*amount*/)
        external
        pure
        override
        returns (uint256)
    {
        revert("TODO: implement Day 2");
    }

    function withdrawAtMaturity(uint256 /*depositId*/) external pure override {
        revert("TODO: implement Day 3");
    }

    function earlyWithdraw(uint256 /*depositId*/) external pure override {
        revert("TODO: implement Day 3");
    }

    function renewDeposit(uint256 /*depositId*/, uint256 /*newPlanId*/)
        external
        pure
        override
        returns (uint256)
    {
        revert("TODO: implement Day 4");
    }

    function autoRenewDeposit(uint256 /*depositId*/) external pure override returns (uint256) {
        revert("TODO: implement Day 4");
    }
}
