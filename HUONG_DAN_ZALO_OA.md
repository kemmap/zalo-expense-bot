# 📘 Hướng Dẫn Tích Hợp Zalo Official Account (OA) & Webhook Bot Chi Tiêu

Tài liệu này hướng dẫn chi tiết từng bước để thiết lập, kết nối và vận hành **Zalo Expense Tracker Bot** với tài khoản **Zalo Official Account (OA)** thực tế, cũng như cách kiểm thử cục bộ bằng **Zalo Webhook Simulator**.

---

## 📑 Mục lục
1. [Tổng quan kiến trúc](#1-tổng-quan-kiến-trúc)
2. [Đăng ký & Thiết lập Zalo Official Account (OA)](#2-đăng-ký--thiết-lập-zalo-official-account-oa)
3. [Tạo Ứng dụng Zalo (App) & Liên kết OA](#3-tạo-ứng-dụng-zalo-app--liên-kết-oa)
4. [Lấy App ID, App Secret, OA Secret Key & Refresh Token](#4-lấy-app-id-app-secret-oa-secret-key--refresh-token)
5. [Cấu hình Webhook URL (ngrok / Cloudflare Tunnel)](#5-cấu-hình-webhook-url-ngrok--cloudflare-tunnel)
6. [Thử nghiệm không cần OA với Webhook Simulator](#6-thử-nghiệm-không-cần-oa-với-webhook-simulator)
7. [Xử lý sự cố thường gặp (Troubleshooting)](#7-xử-lý-sự-cố-thường-gặp-troubleshooting)

---

## 1. Tổng quan kiến trúc

```text
+-------------------+             +-----------------------+             +----------------------+
|  Người dùng Zalo  |  Chat text  |   Zalo OA Platform    |   Webhook   |  Zalo Expense Bot    |
|   (Mobile / PC)   | ----------> |  (openapi.zalo.me)   | ----------> |  (Node.js Express)   |
|                   | <---------- |                       | <---------- |                      |
+-------------------+   CS Msg    +-----------------------+  POST API   +----------------------+
                                                                               |
                                                                               v
                                                                        SQLite Database
                                                                   (Chi tiêu / Thu nhập)
```

- Khi người dùng gửi tin nhắn (ví dụ: `ăn sáng 35k` hoặc `/thongke`) vào Zalo OA:
  1. Zalo Platform chuyển tiếp sự kiện qua `POST /webhook` đến server của bạn.
  2. Server phân tích cú pháp bằng `commandHandler` và lưu dữ liệu vào SQLite.
  3. Server gọi Zalo Customer Support API (`/v3.0/oa/message/cs`) để gửi thẻ phản hồi ngay lập tức cho người dùng.

---

## 2. Đăng ký & Thiết lập Zalo Official Account (OA)

1. **Truy cập trang quản lý OA:**
   - Vào [https://oa.zalo.me/manage/oa](https://oa.zalo.me/manage/oa) và đăng nhập bằng tài khoản Zalo của bạn.
2. **Tạo Official Account mới:**
   - Nhấn **Tạo Official Account mới**.
   - Chọn loại tài khoản:
     * **Doanh nghiệp**: Khuyên dùng để có đầy đủ quyền gửi tin nhắn và tương tác qua API.
     * Hoặc **Cơ quan nhà nước** / **Nội dung** tùy nhu cầu.
   - Nhập thông tin: Tên OA (ví dụ: *Sổ Chi Tiêu Cá Nhân*), danh mục hoạt động, mô tả, ảnh đại diện (avatar) và ảnh bìa (cover).
   - Nhấn **Tạo tài khoản OA**.
3. **Lấy OA ID:**
   - Sau khi tạo thành công, vào trang quản trị OA.
   - Tại góc trên hoặc mục **Quản lý** > **Thông tin tài khoản**, bạn sẽ thấy **Official Account ID (OA ID)** (dãy số dạng `1234567890123456789`).
   - Ghi lại mã này để cấu hình biến `ZALO_OA_ID`.

---

## 3. Tạo Ứng dụng Zalo (App) & Liên kết OA

Zalo yêu cầu một Ứng dụng (App) trên cổng Zalo for Developers để cấp quyền API và quản lý OAuth/Webhook.

1. **Truy cập Zalo Developer:**
   - Vào [https://developers.zalo.me/](https://developers.zalo.me/) và đăng nhập.
2. **Tạo ứng dụng mới:**
   - Nhấn vào **Thêm ứng dụng mới** (hoặc avatar > **Ứng dụng của tôi** > **Tạo ứng dụng**).
   - Điền:
     * **Tên ứng dụng**: Ví dụ: `Expense Tracker Bot`.
     * **Mô tả**: Bot ghi chép và phân tích chi tiêu cá nhân.
   - Nhấn **Tạo App ID**.
3. **Liên kết App với Zalo OA:**
   - Trong bảng điều khiển ứng dụng vừa tạo, tìm mục **Official Account** ở menu bên trái.
   - Chọn **Quản lý Official Account liên kết** > Nhấn **Liên kết OA**.
   - Chọn OA bạn đã tạo ở Bước 2 và nhấn **Gửi yêu cầu liên kết**.
   - Mở trang quản trị Zalo OA ([https://oa.zalo.me](https://oa.zalo.me)) để xác nhận chấp thuận liên kết.

---

## 4. Lấy App ID, App Secret, OA Secret Key & Refresh Token

### 4.1. Lấy App ID và App Secret
- Tại trang ứng dụng [developers.zalo.me](https://developers.zalo.me/):
  - Chọn ứng dụng của bạn > Vào menu **Cài đặt** > **Cài đặt cơ bản**.
  - Bạn sẽ thấy:
    * **App ID**: Lưu vào `ZALO_APP_ID`.
    * **Khóa bí mật của ứng dụng (App Secret)**: Nhấn *Hiện* để copy, lưu vào `ZALO_APP_SECRET`.

### 4.2. Lấy OA Secret Key
- Tại menu **Official Account** > **Cài đặt**:
  - Lấy **OA Secret Key** (nếu Zalo yêu cầu cho OA của bạn), lưu vào `ZALO_OA_SECRET_KEY`.

### 4.3. Cấp quyền API cho Ứng dụng
- Vào menu **Sản phẩm** > Kích hoạt **Tin nhắn** (Customer Support API & Webhook).
- Trong phần **Xét duyệt quyền**, đảm bảo các quyền sau được bật:
  * `oa.message.cs`: Gửi tin nhắn chăm sóc khách hàng.
  * `oa.webhook`: Nhận tin nhắn từ người dùng.

### 4.4. Tạo Access Token & Refresh Token qua OAuth 2.0
Zalo OA sử dụng chuẩn OAuth v4:
1. **Lấy Authorization Code:**
   Truy cập đường dẫn sau trên trình duyệt (thay `<APP_ID>` bằng App ID của bạn):
   ```text
   https://oauth.zalo.me/v4/oa/permission?app_id=<APP_ID>&redirect_uri=https://developers.zalo.me
   ```
   - Chọn OA cần cấp quyền, nhấn **Đồng ý**.
   - Trình duyệt chuyển hướng đến `https://developers.zalo.me?code=<AUTHORIZATION_CODE>&oa_id=...`.
   - Sao chép mã `<AUTHORIZATION_CODE>` trên thanh địa chỉ.

2. **Đổi Authorization Code lấy Access Token & Refresh Token:**
   Thực hiện request HTTP POST (bằng cURL, Postman hoặc terminal):
   ```bash
   curl -X POST https://oauth.zalo.me/v4/oa/access_token \
     -H "secret_key: <ZALO_APP_SECRET>" \
     -H "Content-Type: application/x-www-form-urlencoded" \
     -d "code=<AUTHORIZATION_CODE>&app_id=<ZALO_APP_ID>&grant_type=authorization_code"
   ```
   Kết quả trả về JSON:
   ```json
   {
     "access_token": "ey8...",
     "refresh_token": "rf9...",
     "expires_in": "90000"
   }
   ```
   - Điền `access_token` vào `ZALO_ACCESS_TOKEN` trong `.env`.
   - Điền `refresh_token` vào `ZALO_REFRESH_TOKEN` trong `.env`.
   - Hệ thống bot có sẵn hàm `zaloClient.refreshAccessToken()` để tự động gia hạn token trước khi hết hạn (mỗi 25 tiếng).

---

## 5. Cấu hình Webhook URL (ngrok / Cloudflare Tunnel)

Zalo OA cần gửi Webhook đến một địa chỉ Internet công khai (có HTTPS hợp lệ). Trong quá trình phát triển máy cục bộ (localhost:3000), ta sử dụng `ngrok` hoặc `cloudflared`.

### Cách 1: Sử dụng ngrok (Khuyên dùng)
1. Tải và cài đặt ngrok: [https://ngrok.com/download](https://ngrok.com/download)
2. Khởi động tunnel tới port 3000:
   ```bash
   ngrok http 3000
   ```
3. Copy đường link HTTPS ngrok cung cấp, ví dụ:
   `https://abc1-23-45-67.ngrok-free.app`
4. Webhook URL đầy đủ của bot sẽ là:
   `https://abc1-23-45-67.ngrok-free.app/webhook`

### Cách 2: Sử dụng Cloudflare Tunnel (Miễn phí, không giới hạn phiên)
1. Cài đặt cloudflared:
   ```bash
   cloudflared tunnel --url http://localhost:3000
   ```
2. Sao chép URL định dạng: `https://xxx.trycloudflare.com/webhook`

### Cấu hình Webhook trên Zalo Developer:
1. Vào [https://developers.zalo.me/](https://developers.zalo.me/) > Chọn App của bạn.
2. Tìm menu **Webhook** (trong mục Official Account hoặc Sản phẩm).
3. Điền **Webhook URL**: `https://<ten-mien-tunnel>/webhook`
4. Chọn các sự kiện lắng nghe:
   - ✅ `user_send_text_message` (Người dùng gửi tin nhắn văn bản).
   - ✅ `user_send_image` (nếu mở rộng nhận diện hóa đơn sau này).
5. Nhấn **Lưu cấu hình** hoặc **Kiểm tra kết nối**. Endpoint `GET /webhook` và `POST /webhook` của bot sẽ phản hồi mã 200 OK.

---

## 6. Thử nghiệm không cần OA với Webhook Simulator

Nếu bạn chưa có tài khoản Zalo OA hoặc đang chờ duyệt giấy tờ kinh doanh, bạn hoàn toàn có thể sử dụng **Interactive Webhook Simulator & Chat Playground** tích hợp sẵn ngay trong bot!

### Các bước khởi chạy:
1. Tạo file `.env` từ `.env.example`:
   ```bash
   copy .env.example .env
   ```
   *(Để nguyên các giá trị mẫu, bot sẽ tự động nhận diện chế độ mô phỏng)*

2. Khởi động server:
   ```bash
   node src/server.js
   ```

3. Mở trình duyệt web và truy cập:
   👉 **`http://localhost:3000/simulator`**

### Trải nghiệm các tính năng trên Simulator:
- Giao diện giả lập chuẩn Zalo Chat với bong bóng tin nhắn và avatar trực quan.
- Thử gõ các câu lệnh tiếng Việt tự nhiên:
  * `ăn trưa phở bò 45k` 🍔
  * `đổ xăng 70k` 🚗
  * `mua quần áo uniqlo 650k` 🛍️
  * `tiền điện tháng này 850k` 📄
  * `lương tháng 11 +25tr` 💵
  * `nhận thưởng dự án 2 củ` 💰
  * `/thongke` hoặc `/thongke thang` 📊
  * `/ngansach 10000000` 🎯
  * `/xoa` (hoàn tác giao dịch gần nhất) ↩️
  * `/help` ❓
- Chuyển đổi User ID để kiểm tra dữ liệu độc lập giữa các người dùng khác nhau.
- Bảng **Webhook Inspector** hiển thị trực tiếp JSON payload gửi đến `/api/simulate` và kết quả nhận về.

---

## 7. Xử lý sự cố thường gặp (Troubleshooting)

| Vấn đề | Nguyên nhân | Cách khắc phục |
| :--- | :--- | :--- |
| **Lỗi 401 Unauthorized** khi gửi tin nhắn Zalo | Access Token đã hết hạn (sau 25 tiếng) | Kiểm tra `ZALO_REFRESH_TOKEN` trong `.env` và chạy hàm `zaloClient.refreshAccessToken()`. |
| **Zalo Webhook báo lỗi xác thực URL** | Endpoint chưa trả về HTTP 200 hoặc thiếu challenge | `GET /webhook` đã được viết sẵn để echo lại tham số `challenge`. Đảm bảo server đang chạy và URL tunnel truy cập được từ bên ngoài. |
| **Bot nhận được webhook nhưng không phản hồi Zalo** | User chưa bấm "Quan tâm" OA hoặc vượt quá khung giờ phản hồi (48h) | Zalo OA CS API chỉ cho phép gửi tin nhắn phản hồi khi user chủ động nhắn tin tới OA trong vòng 48h. Hãy nhắn 1 tin từ app Zalo tới OA trước. |
| **Số tiền nhận diện bị sai** | Dùng từ lóng chưa phổ biến | Hệ thống hỗ trợ đa dạng: `k`, `tr`, `triệu`, `củ`, `lít`, `xị`, `vnd`, `đ`. Xem chi tiết tại `/help`. |

---

> [!TIP]
> Để vận hành 24/7 ổn định trên VPS/Server, bạn có thể triển khai bot cùng với **PM2**:
> ```bash
> npm install -g pm2
> pm2 start src/server.js --name "zalo-expense-bot"
> pm2 save
> pm2 startup
> ```
