-- food-budget — Phase 1 schema
--
-- Apply this in Supabase: SQL Editor -> New query -> paste this entire file -> Run.
--
-- This schema is idempotent: it is safe to run multiple times. The `if not exists`
-- and `on conflict do nothing` clauses ensure re-running produces the same result.
--
-- Phase 0 test infrastructure (_ping table) is retained for end-to-end connection
-- testing. Phase 1 adds three tables: stores (shopping locations), products (the
-- pantry of all items Jesse buys), and purchases (one row per shopping trip line item).

create table if not exists _ping (
    id          serial primary key,
    message     text not null,
    created_at  timestamptz not null default now()
);

-- Seed one row so /api/test-db has something to return.
insert into _ping (message) values ('hello from supabase')
    on conflict do nothing;

-- stores: The list of supermarkets and shops where Jesse buys food.
--
-- Each row represents a physical shopping location. The id is used as a foreign key
-- in purchases to track where an item was bought. Store names are unique to prevent
-- duplicates (e.g., no two "Albert Heijn" rows).

create table if not exists stores (
    id          serial primary key,
    name        text not null unique,
    created_at  timestamptz not null default now()
);

-- Seed three stores.
insert into stores (name) values
    ('Albert Heijn'),
    ('Jumbo'),
    ('Lidl')
    on conflict do nothing;

-- products: The pantry — every distinct food item Jesse has ever bought.
--
-- Each row represents a unique product. The combination of name and brand uniquely
-- identifies a product (e.g., "Milk" from "Campina" vs "Albert Heijn brand").
--
-- Nutrition data (calories, protein, carbs, fat per 100g) is nullable because:
-- - Jesse may add a product to the database before looking up its nutrition facts.
-- - Some products (e.g., prepared meals) may not have straightforward nutrition per 100g.
-- - Missing data is explicit (null) rather than silently 0, avoiding silent errors.
--
-- Using numeric(7,2) for calories (e.g., 999.99) and numeric(5,2) for macros (e.g., 99.99)
-- gives sufficient precision for nutritional data without bloat.

create table if not exists products (
    id                  serial primary key,
    name                text not null,
    brand               text,
    calories_per_100g   numeric(7,2),
    protein_per_100g    numeric(5,2),
    carbs_per_100g      numeric(5,2),
    fat_per_100g        numeric(5,2),
    notes               text,
    created_at          timestamptz not null default now()
);

-- purchases: One row per shopping trip line item.
--
-- Each row records when, where, and how much Jesse bought of a product.
--
-- quantity_g (grams) is used rather than items because:
-- - Different packages of the same product have different weights.
-- - Grams are a universal unit and can be cross-referenced with product nutrition.
--
-- price_total (total euros paid) rather than per-gram:
-- - Jesse's shopping list is built from receipt data (total cost, not unit price).
-- - Bulk purchases and promotions mean per-gram price is often unavailable.
--
-- store_id can be null because Jesse may not always record where an item came from
-- (e.g., if the receipt is lost). Using on delete set null means deleting a store
-- does not cascade and delete purchase history.
--
-- product_id uses on delete restrict: deleting a product that has purchases is forbidden.
-- This forces explicit resolution (re-assigning or deleting purchases) rather than
-- silently losing purchase history.

create table if not exists purchases (
    id          serial primary key,
    product_id  integer not null references products(id) on delete restrict,
    store_id    integer references stores(id) on delete set null,
    date        date not null default current_date,
    quantity_g  numeric(8,2) not null,
    price_total numeric(7,2) not null,
    notes       text,
    created_at  timestamptz not null default now()
);
