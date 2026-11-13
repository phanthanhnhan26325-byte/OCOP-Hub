# OCOP Hub

Nền tảng thương mại điện tử đa nhà bán (multi-vendor) cho sản phẩm OCOP, tích hợp hệ thống đăng ký & đặt lịch workshop.

## Stack

- **Frontend/Backend:** Next.js (App Router) + TypeScript + Tailwind CSS
- **Database:** PostgreSQL (Supabase) + Row Level Security
- **Auth:** Supabase Auth (cookie-based SSR)
- **Payment:** Module abstraction (`PaymentProvider`) — hiện chỉ cấu hình mock sandbox; chưa kết nối cổng thanh toán thật

## Setup

1. **Environment**

```bash
cp .env.example .env.local
# điền NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY
# PAYMENT_WEBHOOK_SECRET: chuỗi ngẫu nhiên dài
```

2. **Database**

Áp dụng các migration trong `supabase/migrations/` theo thứ tự:

- `0001_schema.sql` — bảng, enum, trigger
- `0002_rls.sql` — Row Level Security
- `0003_functions.sql` — RPC: `checkout`, `register_workshop`, `apply_payment_success`, `expire_holds`, `generate_settlement`, ...
- `0004_customer_profile.sql` — hồ sơ khách hàng và ảnh đại diện
- `0005_product_workflow.sql` — quyền tạo, gửi duyệt, xem ảnh và quản trị sản phẩm
- `0006_partner_workflow_notifications.sql` — quyền tạo workshop và thông báo sản phẩm, workshop, đơn hàng
- `0007_product_image_uploads.sql` — bucket ảnh sản phẩm PNG/JPG, giới hạn 5 MB mỗi ảnh
- `0008_product_variants.sql` — biến thể khối lượng có giá riêng và checkout theo biến thể
- `0009_product_categories.sql` — danh mục sản phẩm dạng thanh thả xuống
- `0010_admin_security_hardening.sql` — giới hạn quyền cập nhật hồ sơ, thanh toán và RPC quản trị
- `0011_admin_workflows.sql` — RPC giao dịch cho duyệt hồ sơ/sản phẩm/workshop, đối soát và dashboard
- `0012_central_inventory.sql` — tồn kho vật lý trung tâm và lịch sử nhập/xuất
- `0013_inventory_sync_and_product_notifications.sql` — đồng bộ kho khi retry thanh toán và thông báo kết quả duyệt sản phẩm
- `0014_atomic_manual_refunds.sql` — ghi nhận hoàn tiền thủ công trong một giao dịch
- `0015_admin_fee_configuration.sql` — cấu hình phiên bản phí có audit log
- `0016_admin_product_categories.sql` — quản trị danh mục có audit log
- `0017_inventory_movement_accuracy.sql` — bảo đảm nhật ký giữ chỗ ghi đúng tồn kho trước/sau
- `0018_admin_workshop_sessions.sql` — mở/đóng đăng ký buổi workshop có kiểm soát trạng thái và audit log
- Các migration `0019`–`0032` cũng phải được áp dụng theo thứ tự tên trước migration tiếp theo
- `0033_customer_order_actions.sql` — khách xác nhận hoàn thành/hủy đơn, luồng trả hàng có ảnh riêng tư và hàng đợi hoàn tiền
- `0034_selected_cart_checkout.sql` — checkout theo các sản phẩm khách chọn; sản phẩm khác vẫn giữ trong giỏ
- `0035_customer_checkout_contact.sql` — lưu địa chỉ giao hàng mặc định và số liên hệ khách hàng
- `0036_partner_settlement_requests.sql` — tài khoản nhận tiền riêng tư, yêu cầu đối soát theo kỳ, duyệt/chi trả thủ công kèm chứng từ riêng tư; phí nền tảng mặc định 10% nếu chưa có cấu hình toàn sàn
- `0037_verified_reviews.sql` — đánh giá công khai có xác minh cho sản phẩm đã giao và workshop đã tham gia; thông tin khách hàng được ẩn danh
- `0038_default_platform_commission.sql` — bảo đảm checkout áp dụng hoa hồng mặc định 10% khi không tìm thấy cấu hình phí hiệu lực
- `0039_backfill_platform_commission.sql` — tính bổ sung hoa hồng cho đơn đủ điều kiện đã lưu 0₫, cập nhật biên bản đối soát và tính lại số tiền phải trả

### Số liên hệ và địa chỉ giao hàng

- Checkout lấy địa chỉ mặc định đã lưu, hoặc địa chỉ từ đơn gần nhất; khách có thể sửa trước khi đặt hàng. Tỉnh/thành và xã/phường được chọn từ danh mục tĩnh trong `src/data/vietnam-administrative-units.json`; địa chỉ nhà/thôn/tổ vẫn cần nhập.
- Số điện thoại liên hệ chỉ được kiểm tra định dạng di động Việt Nam; checkout **không gửi OTP và không xác minh quyền sở hữu số**. Khách có thể cập nhật số liên hệ trong hồ sơ hoặc khi đặt hàng. Không bật Supabase Phone Auth hay cấu hình SMS provider chỉ để dùng checkout.
- Danh mục địa giới là dữ liệu tham khảo CC BY 4.0, từ [Địa Chỉ Việt — Dữ liệu mở](https://diachiviet.com/du-lieu-mo/) và [HuyChuong/vietnam-administrative-units](https://github.com/HuyChuong/vietnam-administrative-units/tree/17bc7dd44aa71b1aff671664c6ccb2bd21ed5e32). Đây không thay thế văn bản pháp quy; cần cập nhật/đối chiếu với nguồn chính thức khi địa giới thay đổi.

Trước khi áp dụng `0012_central_inventory.sql`, cần chờ hoặc xử lý hết các đơn đang giữ chỗ (`reserved_qty > 0`); migration sẽ dừng nếu còn giữ chỗ. Migration lưu số lượng đối tác khai báo cũ vào `legacy_partner_declared_qty` nhưng khởi tạo tồn kho vật lý bằng **0**. Sau khi áp dụng, quản trị viên phải kiểm kê và ghi nhận tồn kho mở đầu tại **Admin → Kho trung tâm**; sản phẩm chỉ có thể bán khi đã có tồn kho thực tế.

Chỉ áp dụng migration sau khi đã sao lưu và kiểm tra trên môi trường phù hợp. Không chạy migration lên cơ sở dữ liệu production khi chưa được phê duyệt và chưa xử lý các điều kiện vận hành nêu trên.

3. **Seed Admin**

```bash
npm run seed:admin   # ADMIN_EMAIL/ADMIN_PASSWORD qua env (mặc định admin@ocop.hub / ChangeMe@123456)
```

> Admin **không** đăng ký công khai — chỉ sinh từ script này.

4. **Chạy dev**

```bash
npm install
npm run dev
```

## Nguyên tắc nghiệp vụ cốt lõi

- **Kho trung tâm:** `inventory_balances` là số lượng vật lý; `product_availability` là projection cho storefront, gồm số lượng thực tế và phần đang giữ chỗ. Chỉ quản trị viên được nhập/xuất/điều chỉnh và mọi thay đổi được lưu lịch sử.
- **Đơn nhiều doanh nghiệp:** 1 Parent Order → N Sub-orders theo Partner; **1 payment** gắn Parent Order.
- **Đặt hàng từ giỏ:** khách chọn từng sản phẩm hoặc chọn tất cả; checkout chỉ tạo đơn, giữ tồn kho và xóa khỏi giỏ các sản phẩm đã chọn.
- **Đánh giá đã xác minh:** khách đánh giá sản phẩm sau khi đơn đã giao/hoàn tất và workshop sau khi đã tham gia; mỗi dòng hàng/đăng ký có một đánh giá có thể cập nhật. Điểm sao và nhận xét được công khai, tên hiển thị được ẩn danh.
- **Xác nhận đơn:** trước khi giao khách có thể hủy; sau khi giao chỉ khách hàng được xác nhận hoàn thành hoặc gửi yêu cầu trả hàng. Doanh nghiệp duyệt yêu cầu, khách báo đã gửi hàng, doanh nghiệp xác nhận nhận lại hàng rồi mới đưa khoản tiền vào hàng đợi hoàn.
- **Thanh toán:** trạng thái `PAID` chỉ đến từ **webhook đã xác thực chữ ký + số tiền** — không tin frontend redirect; chống trùng bằng unique `payment_events.event_id` + CAS state transition.
- **Workshop:** đăng ký theo **buổi cụ thể** (session), giữ chỗ chỗ ngồi原子 (`register_workshop` RPC), hết hạn thanh toán → trả chỗ (`expire_holds` cron).
- **Phân quyền 3 tầng:** proxy (redirect) → service (`requireRole/requireApprovedPartner`) → RLS.
- **Đối soát doanh nghiệp:** doanh nghiệp lưu tài khoản nhận tiền riêng tư và yêu cầu đối soát cho tháng đã kết thúc. Snapshot dùng doanh thu, phí sàn đã ghi nhận trên đơn, hoàn tiền và điều chỉnh; mặc định phí toàn sàn là 10% nếu chưa có cấu hình, còn cấu hình riêng của doanh nghiệp vẫn được tôn trọng. Việc đổi cấu hình không hồi tố đơn cũ; riêng các đơn đủ điều kiện trước đây bị lưu phí 0 do thiếu cấu hình sẽ được migration `0039` tính bổ sung và ghi nhật ký điều chỉnh. Admin duyệt số tiền sau khi trừ phí sàn, chuyển khoản thủ công, rồi tải chứng từ JPG/PNG/PDF (tối đa 5 MB) và mã giao dịch; trạng thái chỉ thành `PAID` sau khi ghi nhận đủ các bước này. Hệ thống không tự chuyển tiền.
- **Hoàn tiền/chi trả:** chưa có tích hợp ngân hàng/cổng hoàn tiền thật. Yêu cầu hoàn được xếp hàng; quản trị viên chỉ ghi nhận hoàn tiền sau khi chuyển tiền bên ngoài và nhập mã tham chiếu đối soát. Trạng thái chờ không có nghĩa tiền đã được chuyển.

## Cron

Gọi định kỳ (Vercel Cron hoặc scheduler):

```
POST /api/cron/payments-maintenance
Authorization: Bearer $CRON_SECRET
```

Giải phóng hold hết hạn + retry sync `PENDING_SYNC`.

## Cấu trúc

```
src/app          — route groups: customer (mặc định), /partner, /admin, /pay/mock
src/modules      — nghiệp vụ: auth, orders, payments, ...
src/lib         — env, supabase clients, rbac, errors
src/components   — UI theo khu vực
supabase/        — migrations
scripts/         — seed admin
```
