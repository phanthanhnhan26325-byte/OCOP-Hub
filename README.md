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

(Có thể dùng Supabase CLI: `supabase db push`.)

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

- **Không quản lý kho vật lý:** chỉ khai báo `product_availability` (số lượng có thể cung cấp) + `reserved_qty` (giữ chỗ tạm trong lúc thanh toán).
- **Đơn nhiều doanh nghiệp:** 1 Parent Order → N Sub-orders theo Partner; **1 payment** gắn Parent Order.
- **Thanh toán:** trạng thái `PAID` chỉ đến từ **webhook đã xác thực chữ ký + số tiền** — không tin frontend redirect; chống trùng bằng unique `payment_events.event_id` + CAS state transition.
- **Workshop:** đăng ký theo **buổi cụ thể** (session), giữ chỗ chỗ ngồi原子 (`register_workshop` RPC), hết hạn thanh toán → trả chỗ (`expire_holds` cron).
- **Phân quyền 3 tầng:** proxy (redirect) → service (`requireRole/requireApprovedPartner`) → RLS.

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
