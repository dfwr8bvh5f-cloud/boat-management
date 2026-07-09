-- Technical spec categories are simplified to Machine / Safety equipment /
-- Other going forward - "Machine" replaces the old Engine, Watermaker, and
-- Air conditioner options. Existing rows keep their original category value
-- (still a valid enum member, still displayed correctly), this only changes
-- which options are offered when adding/editing an item.
alter type public.technical_spec_category add value if not exists 'machine';
