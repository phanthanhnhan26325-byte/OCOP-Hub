
-- =========================================================
-- 1. USERS: Restrict account mutations
-- =========================================================

DROP POLICY IF EXISTS users_update_self ON public.users;

CREATE POLICY users_update_self
ON public.users
FOR UPDATE
TO authenticated
USING (
    id = auth.uid() OR public.is_admin()
)
WITH CHECK (
    id = auth.uid() OR public.is_admin()
);

REVOKE UPDATE ON public.users FROM authenticated;

-- Removed "address" because this column does not exist
-- in the current public.users table.
GRANT UPDATE (
    full_name,
    phone,
    avatar_url,
    updated_at
)
ON public.users TO authenticated;


-- =========================================================
-- 2. PARTNER PROFILES
-- =========================================================

DROP POLICY IF EXISTS partner_profiles_insert
ON public.partner_profiles;

DROP POLICY IF EXISTS partner_profiles_update
ON public.partner_profiles;

CREATE POLICY partner_profiles_insert
ON public.partner_profiles
FOR INSERT
TO authenticated
WITH CHECK (
    user_id = auth.uid()
    AND selling_status IN ('NONE', 'PENDING')
    AND reviewed_by IS NULL
    AND reviewed_at IS NULL
    AND reject_reason IS NULL
);

CREATE POLICY partner_profiles_update
ON public.partner_profiles
FOR UPDATE
TO authenticated
USING (
    user_id = auth.uid() OR public.is_admin()
)
WITH CHECK (
    user_id = auth.uid() OR public.is_admin()
);

REVOKE INSERT, UPDATE
ON public.partner_profiles
FROM authenticated;


-- =========================================================
-- 3. PARTNER APPLICATIONS
-- =========================================================

DROP POLICY IF EXISTS partner_apps_insert
ON public.partner_applications;

CREATE POLICY partner_apps_insert
ON public.partner_applications
FOR INSERT
TO authenticated
WITH CHECK (
    partner_id = auth.uid()
    AND status = 'PENDING'
    AND reviewed_by IS NULL
    AND reviewed_at IS NULL
    AND reject_reason IS NULL
);

REVOKE UPDATE, DELETE
ON public.partner_applications
FROM authenticated;


-- =========================================================
-- 4. PAYMENTS
-- =========================================================

DROP POLICY IF EXISTS payments_insert_self_pending
ON public.payments;

CREATE POLICY payments_insert_self_pending
ON public.payments
FOR INSERT
TO authenticated
WITH CHECK (
    customer_id = auth.uid()
    AND status = 'PENDING'
    AND refunded_amount = 0
    AND business_sync_status = 'PENDING_SYNC'
);

REVOKE INSERT
ON public.payments
FROM authenticated;

GRANT INSERT (
    purpose,
    reference_id,
    customer_id,
    amount,
    currency,
    status,
    provider,
    expires_at
)
ON public.payments TO authenticated;

REVOKE UPDATE
ON public.payments
FROM authenticated;


-- =========================================================
-- 5. PAYMENT TRANSACTIONS
-- =========================================================

DROP POLICY IF EXISTS payment_txns_insert_own_pending
ON public.payment_transactions;

CREATE POLICY payment_txns_insert_own_pending
ON public.payment_transactions
FOR INSERT
TO authenticated
WITH CHECK (
    type = 'PAYMENT'
    AND status = 'CREATED'
    AND EXISTS (
        SELECT 1
        FROM public.payments p
        WHERE p.id = payment_id
          AND p.customer_id = auth.uid()
          AND p.status IN ('CREATED', 'PENDING')
          AND p.amount = amount
    )
);

REVOKE INSERT
ON public.payment_transactions
FROM authenticated;

GRANT INSERT (
    payment_id,
    type,
    provider,
    provider_txn_id,
    amount,
    status,
    request,
    response
)
ON public.payment_transactions TO authenticated;


-- =========================================================
-- 6. NOTIFICATIONS
-- =========================================================

REVOKE UPDATE
ON public.notifications
FROM authenticated;

GRANT UPDATE (read_at)
ON public.notifications TO authenticated;


-- =========================================================
-- 7. RESTRICT PRIVILEGED DATABASE FUNCTIONS
-- =========================================================

REVOKE ALL ON FUNCTION
public.checkout(uuid, text, jsonb)
FROM PUBLIC, anon, authenticated;

REVOKE ALL ON FUNCTION
public.register_workshop(uuid, uuid)
FROM PUBLIC, anon, authenticated;

REVOKE ALL ON FUNCTION
public.apply_payment_success(uuid, text, text, text, numeric)
FROM PUBLIC, anon, authenticated;

REVOKE ALL ON FUNCTION
public.expire_holds()
FROM PUBLIC, anon, authenticated;

REVOKE ALL ON FUNCTION
public.sync_pending_payments()
FROM PUBLIC, anon, authenticated;

REVOKE ALL ON FUNCTION
public.generate_settlement(uuid, date, date)
FROM PUBLIC, anon, authenticated;

REVOKE ALL ON FUNCTION
public.cancel_registration(uuid, uuid, text)
FROM PUBLIC, anon, authenticated;


-- =========================================================
-- 8. GRANT EXECUTION TO SERVICE ROLE
-- =========================================================

GRANT EXECUTE ON FUNCTION
public.checkout(uuid, text, jsonb)
TO service_role;

GRANT EXECUTE ON FUNCTION
public.register_workshop(uuid, uuid)
TO service_role;

GRANT EXECUTE ON FUNCTION
public.apply_payment_success(uuid, text, text, text, numeric)
TO service_role;

GRANT EXECUTE ON FUNCTION
public.expire_holds()
TO service_role;

GRANT EXECUTE ON FUNCTION
public.sync_pending_payments()
TO service_role;

GRANT EXECUTE ON FUNCTION
public.generate_settlement(uuid, date, date)
TO service_role;

GRANT EXECUTE ON FUNCTION
public.cancel_registration(uuid, uuid, text)
TO service_role;


-- =========================================================
-- 9. FUNCTION PERMISSIONS
-- =========================================================

REVOKE ALL ON FUNCTION
public.current_role_of(uuid)
FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION
public.is_admin()
TO authenticated, service_role;

GRANT EXECUTE ON FUNCTION
public.is_partner_approved()
TO authenticated, service_role;
