-- 25_unread_realtime.sql — lets the phone's red unread numbers for Feed, NEPA and Tutorial update at once (Supabase Realtime).
-- Run once in the Supabase SQL Editor AFTER 05_feed.sql and 18_bulletins.sql. Safe to re-run. It changes no data and no rules.
-- Without it the numbers still work: the phone recounts from the server on sign-in, when the connection returns, when the tab comes back and every 60 s.
-- Realtime respects the tables' existing read rules (feed_read / bulletin_read), so players only ever get posts they are allowed to see.
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    begin alter publication supabase_realtime add table public.feed_posts; exception when duplicate_object then null; end;
    begin alter publication supabase_realtime add table public.bulletins; exception when duplicate_object then null; end;
  end if;
end $$;
