# Frontend Development Plan — Giao diện ứng dụng tiết kiệm Blockchain

> **Dự án:** Hệ thống tiết kiệm trực tuyến (Blockchain Programming Final Assignment)
> **Ngày lập:** Tuesday, 29/7/2026
> **Số hiệu SV:** `...38`
> **Điểm mục tiêu:** 10 điểm (§7.3 — Frontend Demo)

---

## 1. Tổng quan

Xây dựng giao diện React kết nối MetaMask, cho phép người dùng:
- Xem các kế hoạch tiết kiệm available
- Mở tài khoản tiết kiệm (deposit)
- Xem danh sách tiền gửi đang hoạt động
- Rút tiền (đáo hạn, trước hạn, hoặc theo luồng C1)
- Gia hạn tài khoản (thủ công + tự động)
- Quản trị (nạp quỹ, tạo kế hoạch, tạm dừng hệ thống)

**Ngôn ngữ giao diện:** Tiếng Việt
**Màu sắc:** Xanh dương đậm (#1E40AF) làm chủ đạo — phong cách ngân hàng số hiện đại

---

## 2. Kiến trúc kỹ thuật

### 2.1 Tech Stack

| Thành phần | Công nghệ | Lý do chọn |
|-----------|-----------|------------|
| Framework | React 19 + TypeScript | Yêu cầu.assignment §7.3, type safety |
| Build tool | Vite 6 | Dev server nhanh, setup đơn giản |
| Wallet integration | ethers.js v6 + MetaMask | Đã có typechain-types ethers v6 |
| Styling | Pure CSS | Không phụ thuộc, nhanh, dễ tùy biến |
| Network | Local Hardhat (31337) + Sepolia (11155111) | Local demo + testnet |

### 2.2 Thư mục frontend/

```
frontend/
├── package.json
├── vite.config.ts
├── tsconfig.json
├── index.html
├── src/
│   ├── main.tsx                    # Entry point
│   ├── App.tsx                     # Root component, routing tabs
│   ├── App.css                     # Global styles + CSS variables
│   ├── vite-env.d.ts               # Vite type declarations
│   ├── config/
│   │   └── contracts.json          # Contract addresses (từ deployment artifact)
│   ├── abi/
│   │   ├── SavingCore.json         # ABI-only (từ artifacts/)
│   │   ├── VaultManager.json
│   │   └── MockUSDC.json
│   ├── hooks/
│   │   ├── useWallet.ts            # MetaMask connection state
│   │   └── useContracts.ts         # Contract instances với signer/provider
│   ├── components/
│   │   ├── Layout.tsx              # Sidebar + header wrapper
│   │   ├── ConnectWallet.tsx       # Nút kết nối ví + số dư + mạng
│   │   ├── PlansTab.tsx            # Danh sách kế hoạch + form mở tài khoản
│   │   ├── DepositsTab.tsx         # Danh sách tiền gửi + nút thao tác
│   │   └── AdminTab.tsx            # Quản trị: nạp quỹ, tạo kế hoạch, tạm dừng
│   └── utils/
│       ├── format.ts               # formatUSDC, parseUSDC, formatDate, timeUntil
│       ├── health.ts               # calcTotalInterestObligations, checkFundHealth
│       └── networks.ts             # Chain IDs, RPC URLs, tên mạng
└── public/
    └── favicon.ico
```

### 2.3 Dependencies

```json
{
  "dependencies": {
    "react": "^19.1.0",
    "react-dom": "^19.1.0",
    "ethers": "^6.14.0"
  },
  "devDependencies": {
    "@types/react": "^19.1.0",
    "@types/react-dom": "^19.1.0",
    "@vitejs/plugin-react": "^4.5.0",
    "typescript": "^5.8.0",
    "vite": "^6.3.0"
  }
}
```

Không dùng UI library bên ngoài — pure CSS để đảm bảo tốc độ và không gặp vấn đề dependency.

---

## 3. Triển khai Smart Contract Deployment

### 3.1 hardhat.config.ts — Thêm mạng

```ts
networks: {
  hardhat: { chainId: 31337 },
  localhost: {
    url: "http://127.0.0.1:8545",
    chainId: 31337,
  },
  sepolia: {
    url: process.env.SEPOLIA_RPC_URL || "",
    accounts: process.env.PRIVATE_KEY ? [process.env.PRIVATE_KEY] : [],
    chainId: 11155111,
  },
}
```

### 3.2 Hằng số cá nhân hóa (Personal Variant)

```ts
const GRACE_PERIOD_DAYS = 4;        // Số ngày ân hạn sau đáo hạn
const DEFAULT_APR_BPS = 400;        // APR mặc định 4.00%
const PENALTY_BPS = 450;            // Phạt rút trước hạn 4.50%
const DEFAULT_TENOR_DAYS = 180;     // Kỳ hạn mặc định
```

Hiển thị trên UI: "Kỳ hạn: 180 ngày — includes 4 ngày ân hạn trước khi áp dụng phạt"

### 3.3 scripts/deploy.ts — Deploy + Lưu artifact

Luồng thực thi:
1. Lấy signer deployer
2. Deploy MockUSDC → log địa chỉ
3. Deploy VaultManager(SavingCore=zero, feeReceiver=deployer) → log địa chỉ
4. Deploy SavingCore(MockUSDC, VaultManager) → log địa chỉ
5. **VaultManager.setSavingCore(SavingCore)** — bước kết nối quan trọng nhất
6. VaultManager.setFeeReceiver(deployer)
7. Lưu tất cả địa chỉ vào `deployments/<network>.json`

**Định dạng deployment artifact:**
```json
{
  "network": "localhost",
  "chainId": 31337,
  "MockUSDC": "0x5FbDB2315678afecb367f032d93F642f64180aa3",
  "SavingCore": "0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512",
  "VaultManager": "0x9fE467366792295612A8aC36C3318D6e4A4a4C8c",
  "deployer": "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266",
  "timestamp": "2026-07-29T10:00:00Z"
}
```

### 3.3 scripts/seed.ts — Ghi dữ liệu demo

Luồng thực thi:
1. Đọc deployment artifact
2. Kết nối tới contracts với deployer signer
3. Tạo 3 kế hoạch tiết kiệm:
   - Gói 0: 90 ngày, 400 bps (4%), min 100 USDC, max 50,000 USDC, phạt 450 bps
   - Gói 1: 180 ngày, 400 bps (4%), min 100 USDC, max 50,000 USDC, phạt 450 bps
   - Gói 2: 365 ngày, 600 bps (6%), min 500 USDC, max 100,000 USDC, phạt 450 bps
4. Nạp 100,000 USDC vào VaultManager
5. Mint 10,000 USDC cho deployer (dùng trong demo frontend)
6. Log: "Seed hoàn tất! Đã tạo 3 kế hoạch, đã nạp quỹ."

### 3.4 Lệnh chạy demo

```bash
# Terminal 1: Khởi động Hardhat node
npx hardhat node

# Terminal 2: Deploy + seed
npx hardhat run scripts/deploy.ts --network localhost
npx hardhat run scripts/seed.ts --network localhost

# Terminal 3: Khởi động frontend
cd frontend && npm run dev
```

---

## 4. Thiết kế UI/UX

### 4.1 Bảng màu — "Ngân hàng số"

| Vai trò | Màu | Hex | Sử dụng |
|---------|-----|-----|---------|
| Chính (Primary) | Xanh dương đậm | `#1E40AF` | Header, sidebar, nút chính |
| Chính nhạt | Xanh dương | `#3B82F6` | Hover, tab đang chọn |
| Phụ (Secondary) | Xanh lá | `#059669` | Thành công, số dư, lãi suất |
| Nổi bật (Accent) | Vàng đồng | `#F59E0B` | Highlight, badge, lãi suất nổi bật |
| Nền | Trắng sạch | `#F8FAFC` | Body background |
| Card | Trắng | `#FFFFFF` | Card, input fields |
| Text chính | Đen xám | `#1E293B` | Tiêu đề, nội dung |
| Text phụ | Xám | `#64748B` | Mô tả, labels |
| Nguy hiểm | Đỏ | `#DC2626` | Lỗi, rút trước hạn, cảnh báo |
| Viền | Xám nhạt | `#E2E8F0` | Viền cards, inputs |

**Header gradient:** `linear-gradient(135deg, #1E40AF 0%, #3B82F6 100%)`

### 4.2 Typography

- **Font:** Inter (Google Fonts) — hỗ trợ tiếng Việt, hiện đại, sạch sẽ
- **Heading 1:** 24px, bold
- **Heading 2:** 18px, semibold
- **Body:** 14px, regular
- **Small/Label:** 12px, medium
- **Monospace (địa chỉ ví):** JetBrains Mono, 12px

### 4.3 Bố cục tổng thể

```
┌──────────────────────────────────────────────────────────┐
│  HEADER: Logo "TDS" + "Tiền gửi có hạn"    [Mạng] [Ví]  │  ← gradient xanh dương
├────────────┬─────────────────────────────────────────────┤
│            │                                             │
│  SIDEBAR   │              NỘI DUNG CHÍNH                 │
│  240px     │              (Fluid width)                  │
│            │                                             │
│ 📊 Kế hoạch│  (nội dung tab đang chọn)                   │
│ 💰 Tiền gửi│                                             │
│ ⚙️ Quản trị│                                             │
│            │                                             │
├────────────┴─────────────────────────────────────────────┤
│  FOOTER: "Built on Ethereum • Solidity 0.8.28"          │  ← xám nhạt
└──────────────────────────────────────────────────────────┘
```

### 4.4 Badge trạng thái tiền gửi

| Trạng thái | Badge | Màu | Ý nghĩa |
|------------|-------|-----|---------|
| Active | 🟢 Đang hoạt động | Xanh lá | Đang chờ đáo hạn |
| PrincipalClaimed | 🔵 Đã rút gốc | Xanh dương | C1: đã nhận gốc, chờ nhận lãi |
| Interest partial | 🟡 Đã rút một phần | Vàng | Đã nhận một phần lãi |
| Withdrawn | ⚫ Đã đóng | Xám đậm | Hoàn tất rút tiền |
| ManualRenewed | 🟣 Đã gia hạn thủ công | Tím | Đã gia hạn bởi người dùng |
| AutoRenewed | 🟠 Đã tự gia hạn | Cam | Đã tự động gia hạn |

---

## 5. Chi tiết từng trang

### 5.1 Tab 1: Kế hoạch tiết kiệm (PlansTab)

**Nội dung:**
- Tiêu đề: "Danh sách kế hoạch tiết kiệm"
- Subtitle: "Chọn gói phù hợp và bắt đầu tiết kiệm ngay hôm nay"
- 3 card kế hoạch (hiển thị dạng grid 3 cột)
- Mỗi card: tên gói, kỳ hạn, **4 ngày ân hạn**, APR, phạt, min/max, nút "Mở tài khoản"
- Grace period hiển thị rõ: "Kỳ hạn: 180 ngày — includes 4 ngày ân hạn trước khi áp dụng phạt"
- Form mở tài khoản mới bên dưới:
  - Chọn kế hoạch (dropdown)
  - Nhập số tiền (input với validation min/max/số dư)
  - Thông tin tự động: kỳ hạn, APR, phạt
  - 2 nút: "Phê duyệt USDC" → "Mở tài khoản tiết kiệm"

**Luồng giao dịch:**
1. Chọn kế hoạch → form tự điền thông tin
2. Nhập số tiền → kiểm tra real-time (min/max/số dư USDC)
3. Click "Phê duyệt USDC" → MetaMask popup → approve tx
4. Loading: "Đang phê duyệt..."
5. Thành công: "Phê duyệt thành công!"
6. Click "Mở tài khoản tiết kiệm" → MetaMask popup → openDeposit tx
7. Loading: "Đang mở tài khoản..."
8. Thành công: "Mở tài khoản thành công! Mã khoản gửi: #3"
9. Tự chuyển sang tab "Tiền gửi của tôi"

### 5.2 Tab 2: Tiền gửi của tôi (DepositsTab)

**Nội dung:**
- Tiêu đề: "Tiền gửi của tôi"
- Subtitle: "Quản lý các khoản tiết kiệm đang hoạt động"
- Danh sách tiền gửi (card list, mỗi card là 1 khoản gửi)
- Mỗi card hiển thị: ID, gói, số tiền, APR, trạng thái, ngày đáo hạn **+ 4 ngày ân hạn**, lãi dự kiến
- Nút thao tác phụ thuộc trạng thái:

| Trạng thái | Nút hiển thị | Hành động |
|-----------|-------------|-----------|
| Active + chưa đáo hạn | "Rút trước hạn" | earlyWithdraw (cảnh báo phạt) |
| Active + đã đáo hạn | "Rút khi đáo hạn" | withdrawAtMaturity |
| Active + đã đáo hạn | "Gia hạn" | renewDeposit (chọn gói mới) |
| Active + C1 | "Nhận gốc" | claimPrincipal |
| PrincipalClaimed | "Nhận lãi" | claimInterest |
| PrincipalClaimed + interestClaimed | "Đóng khoản gửi" | burn |
| Withdrawn | "Đốt NFT" | burn |

**C1 Flow chi tiết:**
1. Khoản gửi Active + đã đáo hạn → hiển thị 3 nút: "Rút gốc", "Nhận lãi", "Rút toàn bộ"
2. Click "Rút gốc" → MetaMask → claimPrincipal → nhận gốc, lãi lưu pending
3. Trạng thái chuyển thành "Đã rút gốc" → hiển thị nút "Nhận lãi"
4. Click "Nhận lãi" → MetaMask → claimInterest → nhận lãi từ vault
5. Hoàn tất → trạng thái "Đã đóng"

### 5.3 Tab 3: Quản trị (AdminTab)

**Nội dung:**
- Tiêu đề: "Quản trị hệ thống"
- Subtitle: "Quản lý quỹ, kế hoạch và cài đặt hệ thống"

**Phần 1: Thông tin hệ thống**
- Số dư quỹ (vault balance) — hiển thị số lớn, nổi bật
- Số dư USDC của admin
- Trạng thái hệ thống (đang hoạt động / tạm dừng)
- Tổng số khoản gửi

**Phần 1b: Cảnh báo sức khỏe quỹ (Fund Health Warning)** ⚠️
- Tính **Tổng nợ lãi** (total interest obligations): loop tất cả deposit có status == Active, tính lãi dự kiến cho mỗi khoản:
  ```
  interest = (deposit.amount * deposit.aprBps * (deposit.maturityAt - deposit.openedAt)) / (365 days * 10000)
  totalObligations += interest
  ```
- Hiển thị: "Tổng nợ lãi: X USDC"
- **So sánh với số dư quỹ × 110%** (safety margin):
  - Nếu vaultBalance >= totalObligations × 1.1 → ✅ Banner xanh: "Quỹ an toàn — Đủ khả năng trả lãi"
  - Nếu vaultBalance < totalObligations × 1.1 → 🔴 **Banner đỏ: "CẢNH BÁO: Quỹ không đủ trả lãi! Số dư: X USDC — Nợ lãi: Y USDC"**
- Hiển thị progress bar: `vaultBalance / (totalObligations × 1.1)` với màu tương ứng
- **Lưu ý:** Tính client-side bằng cách loop deposits on-chain (read-only, không tốn gas). C2 (on-chain tracking) đã bỏ qua, frontend tự tính.

**Phần 2: Nạp tiền vào quỹ**
- Input số tiền + nút "Phê duyệt" → "Nạp tiền vào quỹ"
- Hiển thị số dư hiện tại của vault

**Phần 3: Tạo kế hoạch mới**
- Form: kỳ hạn, APR, phạt, min/max
- Nút "Tạo kế hoạch"
- Danh sách kế hoạch hiện tại với nút Bật/Tắt

**Phần 4: Hệ thống**
- Nút "Tạm dừng hệ thống" (pause) — màu đỏ
- Nút "Tiếp tục hệ thống" (unpause) — màu xanh
- Hiển thị trạng thái hiện tại

**Phần 5: Nhật ký hoạt động gần đây (Audit Log)** — Time-permitting
- Truy vấn events bằng `queryFilter` từ cả 2 contracts:
  - SavingCore: `DepositOpened`, `Withdrawn`, `Renewed`, `InterestClaimed`
  - VaultManager: `VaultFunded`
- Bảng data-dense kiểu Etherscan:

| Cột | Nội dung | Format |
|-----|----------|--------|
| Thời gian | Block timestamp | "36 giây trước", "2 phút trước" |
| Sự kiện | Event name + badge màu | 🟢 Deposit, 🔴 Withdraw, 🔵 Renew, 🟡 Interest, ⚪ Fund |
| Địa chỉ | User address | `0x1234...5678` + copy button |
| Số tiền | USDC amount | `formatUSDC()` |
| Tx Hash | Transaction hash | `0xabcd...1234` + link etherscan |

- Dropdown chọn số dòng: 10 / 25 / 50
- Pagination trên + dưới (kiểu Etherscan)
- Auto-refresh khi có tx mới

---

## 6. Hooks & Utilities

### 6.1 useWallet.ts

```ts
// State: address, chainId, provider, signer, isConnected, isCorrectNetwork
// Methods: connect(), disconnect(), switchToNetwork(chainId)
// Events: MetaMask accountsChanged, chainChanged
// Auto-reconnect on page load if previously connected
```

### 6.2 useContracts.ts

```ts
// Input: signer hoặc provider từ useWallet
// Output: { savingCore, vaultManager, usdc } — typed contract instances
// Đọc contract addresses từ config/contracts.json
// Tự tạo contract instances với正确的 ABI
```

### 6.3 utils/format.ts

```ts
formatUSDC(amount: bigint): string      // "10,000.00"
parseUSDC(input: string): bigint        // 10000000000n
formatDate(timestamp: number): string   // "25/10/2026"
timeUntil(timestamp: number): string    // "còn 88 ngày"
shortAddress(addr: string): string      // "0x1234...5678"
```

### 6.4 utils/health.ts — Fund Health Calculator

```ts
// Tính tổng nợ lãi client-side (thay cho C2 on-chain tracking)
async function calcTotalInterestObligations(
  savingCore: Contract,
  nextDepositId: bigint
): Promise<bigint> {
  let totalObligations = 0n;
  for (let i = 1n; i < nextDepositId; i++) {
    const deposit = await savingCore.deposits(i);
    if (deposit.status === 0n) { // Active
      const interest = (deposit.amount * deposit.aprBps * (deposit.maturityAt - deposit.openedAt))
        / (365n * 86400n * 10000n);
      totalObligations += interest;
    }
  }
  return totalObligations;
}

// Kiểm tra quỹ có an toàn không (≥ 110% nợ lãi)
function checkFundHealth(
  vaultBalance: bigint,
  totalObligations: bigint
): { isHealthy: boolean; ratio: number } {
  const required = totalObligations * 110n / 100n;
  return {
    isHealthy: vaultBalance >= required,
    ratio: vaultBalance === 0n ? 0 : Number(vaultBalance * 10000n / required) / 100
  };
}
```

### 6.5 utils/networks.ts

```ts
NETWORKS = {
  31337: { name: "Localhost", color: "green" },
  11155111: { name: "Sepolia", color: "blue" },
}
getNetworkName(chainId): string
isSupportedNetwork(chainId): boolean
```

---

## 7. Flow giao dịch chi tiết

### 7.1 Mở tài khoản tiết kiệm

```
[Chọn gói] → [Nhập số tiền] → [Phê duyệt USDC] → [Mở tài khoản]
                                                      ↓
                                                MetaMask: openDeposit
                                                      ↓
                                                ✅ Mã khoản gửi #3
                                                      ↓
                                                Tự chuyển tab "Tiền gửi"
```

### 7.2 Rút tiền khi đáo hạn (C1)

```
Phương án A: Rút toàn bộ (không có C1)
  [Rút khi đáo hạn] → MetaMask: withdrawAtMaturity → ✅ Nhận Principal + Interest

Phương án B: Tách riêng (C1)
  [Nhận gốc] → MetaMask: claimPrincipal → ✅ Nhận Principal
     ↓
  Trạng thái: PrincipalClaimed
     ↓
  [Nhận lãi] → MetaMask: claimInterest → ✅ Nhận Interest
     ↓
  Trạng thái: Withdrawn
```

### 7.3 Rút trước hạn

```
[Rút trước hạn] → Cảnh báo: "Phạt 450 bps (450 USDC). Nhận: 9,550 USDC"
  → [Xác nhận] → MetaMask: earlyWithdraw → ✅ Đã rút, Phạt: 450 USDC
```

### 7.4 Gia hạn thủ công

```
[Chọn gói mới] → [Gia hạn] → MetaMask: renewDeposit → ✅ Mã mới #4
```

### 7.5 Quản trị

```
Nạp quỹ:     [Nhập số tiền] → [Phê duyệt] → [Nạp tiền] → ✅ Vault: 200,000 USDC
Tạo kế hoạch: [Điền form] → [Tạo] → ✅ Kế hoạch #3 đã tạo
Tạm dừng:     [Tạm dừng] → MetaMask: pause → ✅ Hệ thống tạm dừng
```

---

## 8. Bắt đầu chạy demo

### Lệnh khởi động

```bash
# Terminal 1: Khởi động Hardhat node
npx hardhat node

# Terminal 2: Deploy contracts
npx hardhat run scripts/deploy.ts --network localhost

# Terminal 3: Seed dữ liệu demo
npx hardhat run scripts/seed.ts --network localhost

# Terminal 4: Khởi động frontend
cd frontend && npm run dev
```

### Script demo video (3-5 phút)

1. **(30s)** Giới thiệu: "Đây là ứng dụng tiết kiệm trực tuyến trên blockchain"
2. **(30s)** Kết nối MetaMask: click "Kết nối ví", chọn tài khoản
3. **(60s)** Xem kế hoạch: hiển thị 3 gói, giải thích APR, kỳ hạn
4. **(60s)** Mở tài khoản: chọn gói, nhập 10,000 USDC, approve, openDeposit
5. **(30s)** Xem tiền gửi: hiển thị khoản gửi mới, trạng thái, ngày đáo hạn
6. **(60s)** Rút tiền: Fast-forward thời gian → rút khi đáo hạn → nhận principal + interest
7. **(30s)** C1 demo: claimPrincipal → claimInterest riêng biệt
8. **(30s)** Quản trị: nạp quỹ, tạo kế hoạch mới, **kiểm tra sức khỏe quỹ** (green banner)
9. **(10s)** Kết luận

---

## 9. Vấn đề có thể gặp & Giải pháp

| Vấn đề | Giải pháp |
|--------|-----------|
| MetaMask không detect localhost | Hướng dẫn user thêm mạng localhost:8545 trong MetaMask |
| Transaction revert | Hiển thị lỗi tiếng Việt từ custom errors trong Errors.sol |
| Contract address thay đổi mỗi lần deploy | Đọc từ deployment artifact, không hardcode |
| USDC approve cần thực hiện trước openDeposit | UI hiện 2 nút riêng biệt với trạng thái disable/enable |
| Vault không đủ tiền trả lãi | Hiển thị cảnh báo trước khi rút, C1 giải quyết vấn đề này |
| Sai mạng (không phải localhost) | Tự phát hiện chainId, hiển thị warning + nút chuyển mạng |

---

## 10. Kết quả mong đợi

| Tiêu chí | Kết quả |
|---------|---------|
| MetaMask connection | ✅ Kết nối, hiển thị địa chỉ + số dư |
| Xem kế hoạch | ✅ Hiển thị 3 gói tiết kiệm với đầy đủ thông tin |
| Mở tài khoản | ✅ Approve + OpenDeposit, hiển thị mã khoản gửi |
| Xem tiền gửi | ✅ Danh sách với trạng thái, countdown, lãi dự kiến |
| Rút tiền đáo hạn | ✅ withdrawAtMaturity, nhận principal + interest |
| Rút trước hạn | ✅ earlyWithdraw, cảnh báo phạt |
| C1: Tách gốc/lãi | ✅ claimPrincipal → claimInterest riêng biệt |
| Gia hạn | ✅ renewDeposit với chọn gói mới |
| Quản trị | ✅ Nạp quỹ, tạo kế hoạch, tạm dừng |
| Grace period | ✅ Hiển thị 4 ngày ân hạn trên plan card + deposit maturity |
| Fund health warning | ✅ Banner đỏ khi quỹ < 110% nợ lãi, banner xanh khi an toàn |
| Responsive | ✅ Desktop + tablet |
| Vietnamese UI | ✅ Tất cả labels bằng tiếng Việt |
