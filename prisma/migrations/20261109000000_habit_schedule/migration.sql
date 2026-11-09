-- Flexible habit schedules: every day, specific weekdays, or N times per day/week/month.
-- Existing habits keep exactly the same behaviour:
--   frequency 'daily'            -> {"type":"daily"}
--   frequency 'weekly', N/week   -> {"type":"times_per_period","count":N,"period":"week"}

-- Mirrors parseSchedule() in src/lib/habits/schedule.ts.
CREATE OR REPLACE FUNCTION thrivie_valid_schedule(s jsonb) RETURNS boolean LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE s->>'type'
    WHEN 'daily' THEN true
    WHEN 'specific_days' THEN
      jsonb_typeof(s->'days') = 'array'
      AND jsonb_array_length(s->'days') BETWEEN 1 AND 6
      AND NOT EXISTS (
        SELECT 1 FROM jsonb_array_elements(s->'days') d
        WHERE jsonb_typeof(d) <> 'number' OR (d #>> '{}') !~ '^[0-6]$'
      )
    WHEN 'times_per_period' THEN
      jsonb_typeof(s->'count') = 'number'
      AND (s->>'count') ~ '^[0-9]{1,2}$'
      AND s->>'period' IN ('day', 'week', 'month')
      AND (s->>'count')::int >= 1
      AND (s->>'count')::int <= CASE s->>'period' WHEN 'day' THEN 20 WHEN 'week' THEN 21 ELSE 31 END
    ELSE false
  END
$$;

ALTER TABLE "Habit" ADD COLUMN "schedule" JSONB NOT NULL DEFAULT '{"type":"daily"}';

-- Row Level Security is FORCED on "Habit" (with no system policy), so even the
-- table owner would see no rows. Lift FORCE only for the backfill, then restore it.
ALTER TABLE "Habit" NO FORCE ROW LEVEL SECURITY;
-- BACKFILL-START
UPDATE "Habit" SET "schedule" = CASE
  WHEN "frequency" = 'weekly' THEN jsonb_build_object('type', 'times_per_period', 'count', LEAST(7, GREATEST(1, "timesPerWeek")), 'period', 'week')
  ELSE '{"type":"daily"}'::jsonb
END;
-- BACKFILL-END
ALTER TABLE "Habit" FORCE ROW LEVEL SECURITY;

ALTER TABLE "Habit" ADD CONSTRAINT "Habit_schedule_valid" CHECK (thrivie_valid_schedule("schedule"));
ALTER TABLE "Habit" DROP COLUMN "frequency", DROP COLUMN "timesPerWeek";

-- Tap counter for "8 glasses of water" habits. One row per habit per day (unique already).
ALTER TABLE "HabitCheckin" ADD COLUMN "count" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "HabitCheckin" ADD CONSTRAINT "HabitCheckin_count_valid" CHECK ("count" BETWEEN 1 AND 100);
