alter table public.partner_profiles
  add column if not exists tax_code text;
