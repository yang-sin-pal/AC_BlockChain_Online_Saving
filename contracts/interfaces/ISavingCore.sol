// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @title ISavingCore
/// @notice Interface cho hệ thống gửi tiết kiệm có kỳ hạn (term deposit) trên blockchain.
/// @dev Mỗi deposit là 1 ERC721 NFT. APR và penalty được snapshot tại thời điểm mở deposit.
interface ISavingCore {
    enum Status {
        Active,
        Withdrawn,
        ManualRenewed,
        AutoRenewed
    }

    struct Plan {
        uint256 tenorDays;              // kỳ hạn (số ngày)
        uint256 aprBps;                 // lãi suất năm, đơn vị basis points (100 = 1%)
        uint256 minDeposit;             // số tiền gửi tối thiểu, 0 = không giới hạn
        uint256 maxDeposit;             // số tiền gửi tối đa, 0 = không giới hạn
        uint256 earlyWithdrawPenaltyBps;// phạt khi rút trước hạn, đơn vị bps
        bool enabled;                   // admin có thể tắt plan để ngừng nhận deposit mới
    }

    struct Deposit {
        uint256 planId;
        uint256 principal;
        uint256 aprBpsAtOpen;           // APR snapshot tại thời điểm mở
        uint256 penaltyBpsAtOpen;       // penalty snapshot tại thời điểm mở
        uint256 startAt;
        uint256 maturityAt;
        Status status;
    }

    // ---------- Admin functions ----------

    /// @notice Tạo 1 saving plan mới.
    function createPlan(
        uint256 tenorDays,
        uint256 aprBps,
        uint256 minDeposit,
        uint256 maxDeposit,
        uint256 earlyWithdrawPenaltyBps
    ) external returns (uint256 planId);

    /// @notice Cập nhật APR của 1 plan. Không ảnh hưởng đến deposit đã mở trước đó.
    function updatePlan(uint256 planId, uint256 newAprBps) external;

    /// @notice Bật/tắt 1 plan để cho phép hoặc chặn mở deposit mới.
    function enablePlan(uint256 planId) external;
    function disablePlan(uint256 planId) external;

    // ---------- User functions ----------

    /// @notice Mở 1 deposit mới. User phải approve() token cho contract trước khi gọi.
    function openDeposit(uint256 planId, uint256 amount) external returns (uint256 depositId);

    /// @notice Rút gốc + lãi khi đã đến hoặc quá kỳ hạn.
    function withdrawAtMaturity(uint256 depositId) external;

    /// @notice Rút trước hạn — không nhận lãi, bị trừ phạt trên gốc.
    function earlyWithdraw(uint256 depositId) external;

    /// @notice Gia hạn thủ công sang 1 plan mới sau khi đáo hạn.
    function renewDeposit(uint256 depositId, uint256 newPlanId) external returns (uint256 newDepositId);

    /// @notice Bot (hoặc bất kỳ ai) gọi để tự động gia hạn sau grace period, giữ nguyên APR gốc.
    function autoRenewDeposit(uint256 depositId) external returns (uint256 newDepositId);

    // ---------- Events ----------

    event PlanCreated(uint256 indexed planId, uint256 tenorDays, uint256 aprBps);
    event PlanUpdated(uint256 indexed planId, uint256 newAprBps);
    event DepositOpened(
        uint256 indexed depositId,
        address indexed owner,
        uint256 indexed planId,
        uint256 principal,
        uint256 maturityAt,
        uint256 aprBpsAtOpen
    );
    event Withdrawn(uint256 indexed depositId, address indexed owner, uint256 principal, uint256 interest, bool isEarly);
    event Renewed(uint256 indexed oldDepositId, uint256 indexed newDepositId, uint256 newPrincipal, uint256 newPlanId);
}
