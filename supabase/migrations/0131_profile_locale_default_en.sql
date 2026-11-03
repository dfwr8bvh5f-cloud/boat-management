-- New profiles that never pick a language default to English (the UI already
-- does when no language cookie is set; push notifications read profiles.locale
-- from the database, so the two defaults must agree - see reconcileLocale in
-- src/app/login/actions.ts). Only the column DEFAULT changes: no existing
-- profile row is touched, so anyone who already chose a language keeps it.
alter table public.profiles alter column locale set default 'en';
