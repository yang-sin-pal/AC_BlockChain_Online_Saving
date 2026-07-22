// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/access/Ownable2Step.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "../interfaces/ISavingCore.sol";

/// @title SavingCore
/// @notice Business logic: saving plan, mở/rút/gia hạn deposit, mint NFT chứng chỉ.
/// @dev Ngày 1: chỉ dựng khung + logic quản lý plan. openDeposit/withdraw/renew làm ở Ngày 2-4.
contract SavingCore is ISavingCore, ERC721, Ownable2Step, ReentrancyGuard {
    // depositId => Deposit
    mapping(uint256 => Deposit) public deposits;
    uint256 public nextDepositId;

    // planId => Plan
    mapping(uint256 => Plan) public plans;
    uint256 public nextPlanId;

    constructor() ERC721("Term Deposit Certificate", "TDC") Ownable(msg.sender) {}

    // ---------- Admin: quản lý plan ----------

    function createPlan(
        uint256 tenorDays,
        uint256 aprBps,
        uint256 minDeposit,
        uint256 maxDeposit,
        uint256 earlyWithdrawPenaltyBps
    ) external onlyOwner returns (uint256 planId) {
        planId = nextPlanId++;
        plans[planId] = Plan({
            tenorDays: tenorDays,
            aprBps: aprBps,
            minDeposit: minDeposit,
            maxDeposit: maxDeposit,
            earlyWithdrawPenaltyBps: earlyWithdrawPenaltyBps,
            enabled: true
        });
        emit PlanCreated(planId, tenorDays, aprBps);
    }

    function updatePlan(uint256 planId, uint256 newAprBps) external onlyOwner {
        // Chỉ đổi APR cho deposit MỚI — deposit cũ đã snapshot APR nên không bị ảnh hưởng.
        plans[planId].aprBps = newAprBps;
        emit PlanUpdated(planId, newAprBps);
    }

    function enablePlan(uint256 planId) external onlyOwner {
        plans[planId].enabled = true;
    }

    function disablePlan(uint256 planId) external onlyOwner {
        plans[planId].enabled = false;
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
