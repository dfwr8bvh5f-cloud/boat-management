-- Persists each user's last-selected app language on their profile so
-- server-side push notifications (sent from a cron job, outside any
-- request/cookie context) can be translated per-recipient instead of
-- always going out in one hardcoded language.
alter table public.profiles add column if not exists locale text not null default 'he' check (locale in ('he', 'en', 'el'));
