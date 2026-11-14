# 💰 Zalo Expense Tracker Bot (Bot Quản Lý Chi Tiêu Cá Nhân)

Ứng dụng Bot Quản lý Chi tiêu Cá nhân thông minh tích hợp trên nền tảng **Zalo Official Account (OA)**, cho phép người dùng ghi chép thu chi nhanh chóng bằng ngôn ngữ tự nhiên tiếng Việt, phân loại tự động và xuất báo cáo trực quan tức thì.

---

## ✨ Tính Năng Nổi Bật

1. ⚡ **Ghi chép thu chi siêu tốc bằng tiếng Việt tự nhiên**:
   - Tự động hiểu các dạng viết tắt và tiếng lóng tiền tệ phổ biến: `35k`, `50.000đ`, `15tr`, `2 củ`, `3 lít`, `5 xị`, `+20tr`, `-50k`...
   - Ví dụ:
     - `ăn sáng 35k` -> Tự động nhận diện chi tiêu 35.000đ danh mục **Ăn uống** 🍔
     - `đổ xăng 50k` -> Tự động nhận diện chi tiêu 50.000đ danh mục **Đi lại** 🚗
     - `lương +15tr` -> Tự động nhận diện thu nhập 15.000.000đ danh mục **Thu nhập** 💵

2. 🏷️ **Phân loại danh mục thông minh**:
   - Tự động nhận diện và gắn thẻ danh mục thông qua từ khóa:
     - 🍔 **Ăn uống**: cơm, phở, bún, bánh mì, cafe, highland, kfc, trà sữa, nhậu, lẩu...
     - 🚗 **Đi lại**: xăng, grab, taxi, be, xe bus, gửi xe, bảo dưỡng...
     - 🛍️ **Mua sắm**: shopee, lazada, tiki, quần áo, giầy, siêu thị...
     - 📄 **Hóa đơn**: điện, nước, internet, wifi, tiền phòng, chung cư...
     - 🎮 **Giải trí**: netflix, spotify, xem phim, rạp, game, steam...
     - 💊 **Y tế**: thuốc, khám, bệnh viện, nha khoa...
     - 💵 **Thu nhập**: lương, thưởng, hoàn tiền, nhận chuyển khoản...
     - 📝 **Khác**: danh mục mặc định cho các khoản chưa phân loại.

3. 📊 **Báo cáo thống kê trực quan**:
   - `/thongke` hoặc `/baocao [ngay | tuan | thang]`:
     - Tổng chi tiêu, tổng thu nhập, số dư còn lại.
     - Thanh đo tỷ lệ ngân sách trực quan (`[████░░░░░░] 45%`).
     - Bảng phân bổ chi tiêu theo từng danh mục có biểu tượng sinh động.

4. 🎯 **Quản lý ngân sách & Cảnh báo vượt mức**:
   - Lệnh `/ngansach [số tiền]` (ví dụ: `/ngansach 5000000` hoặc `/ngansach 5tr`).
   - Cảnh báo trực quan khi chi tiêu vượt quá 80% hoặc 100% ngân sách đề ra.

5. ↩️ **Hoàn tác giao dịch nhanh**:
   - Lệnh `/xoa` hoặc `/undo` để xóa ngay giao dịch vừa ghi gần nhất khi nhập nhầm.

6. 📱 **Trình giả lập Zalo Chat Simulator (Web Playground)**:
   - Giao diện web mô phỏng ứng dụng chat Zalo trực quan tại `http://localhost:3000/simulator`.
   - Giúp kiểm thử, trải nghiệm đầy đủ toàn bộ tính năng và logic của bot ngay trên trình duyệt mà chưa cần tạo hay xác minh tài khoản Zalo OA.

---

## 📁 Cấu Trúc Dự Án

```
zalo-expense-bot/
├── .env.example              # Mẫu cấu hình biến môi trường Zalo OA & Server
├── HUONG_DAN_ZALO_OA.md      # Hướng dẫn chi tiết tạo & liên kết Zalo OA thực tế
├── package.json              # Khai báo dependencies và scripts
├── README.md                 # Tài liệu hướng dẫn dự án (file này)
├── src/
│   ├── server.js             # Express Webhook Server, Web Simulator & Health Check
│   ├── db/
│   │   ├── database.js       # Khởi tạo SQLite database (better-sqlite3) & schema
│   │   ├── repository.js     # Thao tác dữ liệu: addTransaction, summary, budget...
│   │   └── test_db.js        # Unit test cho tầng database
│   ├── services/
│   │   ├── expenseParser.js  # Bộ xử lý ngôn ngữ tự nhiên tiếng Việt & số tiền
│   │   ├── commandHandler.js # Điều hướng lệnh (/thongke, /ngansach, /xoa...) & phản hồi
│   │   └── test_parser.js    # Unit test cho bộ phân tích câu lệnh tiếng Việt
│   ├── zalo/
│   │   └── zaloClient.js     # Client giao tiếp với Zalo OA Open API (v3.0)
│   └── tests/
│       └── integration_test.js # Kiểm thử tích hợp End-to-End toàn bộ hệ thống
```

---

## 🚀 Cài Đặt & Khởi Chạy

### 1. Yêu cầu môi trường
- **Node.js**: v18.0.0 trở lên (khuyến nghị v20+ hoặc v24).
- **Hệ điều hành**: Windows, macOS, hoặc Linux.

### 2. Cài đặt các gói phụ thuộc (Dependencies)
Mở terminal tại thư mục dự án và chạy:
```powershell
npm.cmd install
```
*(Trên Linux/macOS có thể dùng `npm install`)*

### 3. Chạy kiểm thử tự động (Unit & Integration Tests)
Chạy bộ kiểm thử tích hợp End-to-End đảm bảo mọi module hoạt động chính xác:
```powershell
npm.cmd test
```

### 4. Khởi động ứng dụng
Khởi động webhook server và trình giả lập:
```powershell
npm.cmd start
```
*(Hoặc chế độ dev tự động reload khi sửa code: `npm.cmd run dev`)*

---

## 🎮 Trải Nghiệm Qua Web Simulator

Sau khi khởi động server (`npm.cmd start`), bạn có thể mở ngay trình duyệt và truy cập:

👉 **[http://localhost:3000/simulator](http://localhost:3000/simulator)**

Tại giao diện Web Simulator, bạn có thể nhập các tin nhắn thử nghiệm:
- `ăn sáng 35k`
- `đổ xăng 50k`
- `mua áo sơ mi shopee 250k`
- `lương +15tr`
- `/ngansach 5000000`
- `/thongke`
- `/xoa`
- `/trogiup`

---

## ⚙️ Cấu Hình Kết Nối Zalo OA Thật

Khi muốn triển khai thực tế trên Zalo Official Account:

1. **Sao chép file cấu hình**:
   ```powershell
   cp .env.example .env
   ```

2. **Cập nhật thông tin trong file `.env`**:
   - `PORT`: Cổng chạy server (mặc định: `3000`).
   - `ZALO_APP_ID`: App ID từ [Zalo Developers Portal](https://developers.zalo.me/).
   - `ZALO_APP_SECRET`: App Secret của Zalo App.
   - `ZALO_OA_ID`: ID tài khoản Zalo OA của bạn.
   - `ZALO_OA_SECRET_KEY`: Secret Key của OA.
   - `ZALO_REFRESH_TOKEN`: Refresh token để gia hạn Access Token tự động.
   - `WEBHOOK_SECRET`: Token xác thực webhook bí mật (tùy chọn).

3. **Public Webhook URL ra Internet**:
   Sử dụng Cloudflare Tunnel hoặc ngrok để mở cổng local:
   ```powershell
   ngrok http 3000
   ```
   Lấy URL HTTPS (ví dụ: `https://your-domain.ngrok-free.app/webhook`) và cấu hình vào mục Webhook trong trang Zalo Developers.

> 📖 **Xem hướng dẫn chi tiết từng bước:** Đọc file [HUONG_DAN_ZALO_OA.md](HUONG_DAN_ZALO_OA.md) để được hướng dẫn chi tiết từ bước đăng ký Zalo OA đến cấp quyền API.

---

## 📋 Danh Sách Câu Lệnh & Cú Pháp Mẫu

| Tin nhắn / Lệnh | Ý nghĩa | Ví dụ kết quả |
| :--- | :--- | :--- |
| `<mô tả> <số tiền>` | Ghi khoản chi tiêu | `cơm trưa 40k`, `cafe 30k` |
| `<mô tả> +<số tiền>` / `lương <số tiền>` | Ghi khoản thu nhập | `lương +15tr`, `thưởng dự án 2 củ` |
| `/thongke` hoặc `/baocao` | Xem báo cáo tổng quan tháng hiện tại | Thống kê thu, chi, số dư, tỷ lệ ngân sách |
| `/thongke ngay` | Xem báo cáo chi tiêu hôm nay | Tổng chi và chi tiết hôm nay |
| `/thongke tuan` | Xem báo cáo chi tiêu tuần này | Tổng chi và chi tiết tuần này |
| `/ngansach <số tiền>` | Thiết lập ngân sách chi tiêu hàng tháng | `/ngansach 5tr` hoặc `/ngansach 5000000` |
| `/xoa` hoặc `/undo` | Xóa giao dịch vừa nhập gần nhất | Hủy giao dịch vừa thêm thành công |
| `/danhmuc` | Danh sách các nhóm danh mục hỗ trợ | Hiển thị 8+ nhóm danh mục |
| `/trogiup` hoặc `/help` | Xem hướng dẫn sử dụng chi tiết | Danh sách cú pháp và ví dụ |
