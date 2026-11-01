drop trigger if exists product_availability_central_inventory
  on public.product_availability;

drop function if exists public.sync_central_inventory_reservation();

drop function if exists public.admin_record_inventory_movement(
  uuid,
  uuid,
  text,
  integer,
  text
);
