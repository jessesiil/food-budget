-- food-budget — Phase 0 schema
--
-- Apply this in Supabase: SQL Editor -> New query -> paste this entire file -> Run.
--
-- Phase 0 only needs a single test table to prove the database connection works
-- end-to-end (backend -> Postgres -> backend -> frontend). The real product
-- and purchase tables come in Phase 1.

create table if not exists _ping (
    id          serial primary key,
    message     text not null,
    created_at  timestamptz not null default now()
);

-- Seed one row so /api/test-db has something to return.
insert into _ping (message) values ('hello from supabase');
