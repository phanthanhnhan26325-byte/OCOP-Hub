create table public.product_reviews (
  id uuid primary key default gen_random_uuid(),
  order_item_id uuid not null unique references public.order_items(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  customer_id uuid not null references public.users(id) on delete cascade,
  display_name text not null,
  rating smallint not null check (rating between 1 and 5),
  comment text not null default '' check (char_length(comment) <= 1000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_product_reviews_public
  on public.product_reviews(product_id, created_at desc);

create table public.workshop_reviews (
  id uuid primary key default gen_random_uuid(),
  registration_id uuid not null unique references public.workshop_registrations(id) on delete cascade,
  workshop_id uuid not null references public.workshops(id) on delete cascade,
  customer_id uuid not null references public.users(id) on delete cascade,
  display_name text not null,
  rating smallint not null check (rating between 1 and 5),
  comment text not null default '' check (char_length(comment) <= 1000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_workshop_reviews_public
  on public.workshop_reviews(workshop_id, created_at desc);

alter table public.product_reviews enable row level security;
alter table public.workshop_reviews enable row level security;

revoke all on public.product_reviews, public.workshop_reviews from anon, authenticated;

create view public.product_reviews_public
with (security_barrier = true)
as
select id, product_id, display_name, rating, comment, created_at, updated_at
from public.product_reviews;

create view public.workshop_reviews_public
with (security_barrier = true)
as
select id, workshop_id, display_name, rating, comment, created_at, updated_at
from public.workshop_reviews;

grant select on public.product_reviews_public, public.workshop_reviews_public to anon, authenticated;

create view public.product_review_stats
with (security_barrier = true)
as
select
  product_id,
  count(*)::int as review_count,
  avg(rating)::numeric(3, 2) as average_rating,
  count(*) filter (where rating = 1)::int as one_star,
  count(*) filter (where rating = 2)::int as two_stars,
  count(*) filter (where rating = 3)::int as three_stars,
  count(*) filter (where rating = 4)::int as four_stars,
  count(*) filter (where rating = 5)::int as five_stars
from public.product_reviews
group by product_id;

create view public.workshop_review_stats
with (security_barrier = true)
as
select
  workshop_id,
  count(*)::int as review_count,
  avg(rating)::numeric(3, 2) as average_rating,
  count(*) filter (where rating = 1)::int as one_star,
  count(*) filter (where rating = 2)::int as two_stars,
  count(*) filter (where rating = 3)::int as three_stars,
  count(*) filter (where rating = 4)::int as four_stars,
  count(*) filter (where rating = 5)::int as five_stars
from public.workshop_reviews
group by workshop_id;

grant select on public.product_review_stats, public.workshop_review_stats to anon, authenticated;
