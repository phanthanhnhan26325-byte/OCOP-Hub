# OCOP Hub

Nền tảng thương mại điện tử đa nhà bán (multi-vendor) cho sản phẩm OCOP, tích hợp hệ thống đăng ký & đặt lịch workshop.

## Stack

- **Frontend/Backend:** Next.js (App Router) + TypeScript + Tailwind CSS
- **Database:** PostgreSQL (Supabase) + Row Level Security
- **Auth:** Supabase Auth (cookie-based SSR)
- **Payment:** Module abstraction (`PaymentProvider`) — mặc định mock sandbox, sẵn sàng tích hợp VNPay/MoMo

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
- **Thanh toán:** trạng thái `PAID` chỉ đến từ **webhook đã xác thực chữ ký + số tiền** — không tin frontend redirect; chống trùng bằng unique `payment_events.event_id` + CAS state transition.
- **Workshop:** đăng ký theo **buổi cụ thể** (session), giữ chỗ chỗ ngồi原子 (`register_workshop` RPC), hết hạn thanh toán → trả chỗ (`expire_holds` cron).
- **Phân quyền 3 tầng:** proxy (redirect) → service (`requireRole/requireApprovedPartner`) → RLS.
- **Hoàn tiền/chi trả thủ công:** hệ thống không kết nối ngân hàng. Chỉ ghi nhận hoàn tiền hoặc payout sau khi giao dịch chuyển tiền đã được thực hiện bên ngoài và có mã tham chiếu đối soát.

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
