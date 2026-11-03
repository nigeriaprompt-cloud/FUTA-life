#!/bin/sh
# Builds supabase/ALL_IN_ONE.sql = every SQL file in the right order, for ONE paste into the Supabase SQL Editor.
# Re-run this script after editing any supabase/*.sql file. The order matters (01 first; 11-13 after 01/03 because 01 resets grants).
set -e; cd "$(dirname "$0")/../supabase"
OUT=ALL_IN_ONE.sql; : > $OUT
echo "-- FUTA World: all database files in order. Paste the WHOLE file into Supabase > SQL Editor > Run. Safe to re-run." >> $OUT
for f in 01_schema 02_avatar_options 03_activities 04_auth_backfill 05_feed 06_property 07_cars 08_accessories 09_salon 10_chat_social 11_campus 11_account 12_profile 13_vault 14_transfers 15_receipts 16_unread 17_admin_metrics 18_global_chat 18_celebrations 18_bulletins 19_arcade 20_forum 21_online 22_building_counts 23_neighbours 24_neighbour_notifications 25_unread_realtime 26_admin_send_money 21_bots 21b_bots_content; do
  printf '\n-- ===================== %s.sql =====================\n' "$f" >> $OUT; cat "$f.sql" >> $OUT
done
echo "wrote supabase/$OUT ($(wc -c < $OUT) bytes)"
