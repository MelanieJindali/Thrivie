-- Row Level Security for every table.
--
-- The app never queries as the table owner. Each transaction first runs
--   set_config('app.user_id', <id>, true), set_config('app.system', on|off, true),
--   set_config('role', 'thrivie_rls', true)
-- so queries execute as "thrivie_rls", which cannot bypass RLS. Even if the
-- connecting role has BYPASSRLS (common on hosted Postgres), the restricted
-- role applies for the whole transaction. With no user id set, user tables
-- return nothing.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'thrivie_rls') THEN
    CREATE ROLE thrivie_rls NOLOGIN NOBYPASSRLS NOINHERIT;
  END IF;
END $$;
GRANT thrivie_rls TO CURRENT_USER;
GRANT USAGE ON SCHEMA public TO thrivie_rls;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO thrivie_rls;
DO $$ BEGIN
  IF to_regclass('public._prisma_migrations') IS NOT NULL THEN
    EXECUTE 'REVOKE ALL ON TABLE "_prisma_migrations" FROM thrivie_rls';
  END IF;
END $$;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO thrivie_rls;

CREATE OR REPLACE FUNCTION thrivie_uid() RETURNS text LANGUAGE sql STABLE AS
$$ SELECT NULLIF(current_setting('app.user_id', true), '') $$;
CREATE OR REPLACE FUNCTION thrivie_is_system() RETURNS boolean LANGUAGE sql STABLE AS
$$ SELECT coalesce(current_setting('app.system', true), '') = 'on' $$;

-- Enable + force RLS everywhere (FORCE also applies it to the table owner).
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['User','Session','RateEvent','MagicLink','Settings','HealthLog','Workout','Exercise','Habit','HabitCheckin',
                           'Goal','GoalProgress','JournalEntry','Attachment','Alias','PushSubscription','ApiToken','AppConfig'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
  END LOOP;
END $$;

-- Data owned directly by a user: only that user.
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['HealthLog','Workout','Habit','JournalEntry','Alias'] LOOP
    EXECUTE format('CREATE POLICY owner_all ON %I USING ("userId" = thrivie_uid()) WITH CHECK ("userId" = thrivie_uid())', t);
  END LOOP;
END $$;

-- Goals may only link to the same user's habit.
CREATE POLICY owner_all ON "Goal"
  USING ("userId" = thrivie_uid())
  WITH CHECK ("userId" = thrivie_uid() AND ("linkHabitId" IS NULL OR EXISTS (SELECT 1 FROM "Habit" h WHERE h.id = "linkHabitId" AND h."userId" = thrivie_uid())));

-- Attachments may only belong to the same user's journal entry.
CREATE POLICY owner_all ON "Attachment"
  USING ("userId" = thrivie_uid())
  WITH CHECK ("userId" = thrivie_uid() AND ("journalId" IS NULL OR EXISTS (SELECT 1 FROM "JournalEntry" j WHERE j.id = "journalId" AND j."userId" = thrivie_uid())));

-- Child rows: visible/writable only through a parent the user owns.
CREATE POLICY owner_all ON "Exercise"
  USING (EXISTS (SELECT 1 FROM "Workout" w WHERE w.id = "workoutId" AND w."userId" = thrivie_uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM "Workout" w WHERE w.id = "workoutId" AND w."userId" = thrivie_uid()));
CREATE POLICY owner_all ON "HabitCheckin"
  USING (EXISTS (SELECT 1 FROM "Habit" h WHERE h.id = "habitId" AND h."userId" = thrivie_uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM "Habit" h WHERE h.id = "habitId" AND h."userId" = thrivie_uid()));
CREATE POLICY owner_all ON "GoalProgress"
  USING (EXISTS (SELECT 1 FROM "Goal" g WHERE g.id = "goalId" AND g."userId" = thrivie_uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM "Goal" g WHERE g.id = "goalId" AND g."userId" = thrivie_uid()));

-- Owner access plus the narrow system access each job needs.
CREATE POLICY owner_all ON "Settings" USING ("userId" = thrivie_uid()) WITH CHECK ("userId" = thrivie_uid());
CREATE POLICY system_all ON "Settings" USING (thrivie_is_system()) WITH CHECK (thrivie_is_system());         -- sign-up, reminders job

CREATE POLICY owner_all ON "PushSubscription" USING ("userId" = thrivie_uid()) WITH CHECK ("userId" = thrivie_uid());
CREATE POLICY system_all ON "PushSubscription" USING (thrivie_is_system()) WITH CHECK (thrivie_is_system()); -- sending, de-duplicating devices

CREATE POLICY owner_all ON "ApiToken" USING ("userId" = thrivie_uid()) WITH CHECK ("userId" = thrivie_uid());
CREATE POLICY system_all ON "ApiToken" USING (thrivie_is_system()) WITH CHECK (thrivie_is_system());         -- token lookup by hash

CREATE POLICY owner_read ON "User" FOR SELECT USING ("id" = thrivie_uid());
CREATE POLICY system_all ON "User" USING (thrivie_is_system()) WITH CHECK (thrivie_is_system());             -- sign-up, sign-in

CREATE POLICY owner_all ON "Session" USING ("userId" = thrivie_uid()) WITH CHECK ("userId" = thrivie_uid());
CREATE POLICY system_all ON "Session" USING (thrivie_is_system()) WITH CHECK (thrivie_is_system());

-- System-only tables.
CREATE POLICY system_all ON "RateEvent" USING (thrivie_is_system()) WITH CHECK (thrivie_is_system());
CREATE POLICY system_all ON "MagicLink" USING (thrivie_is_system()) WITH CHECK (thrivie_is_system());
CREATE POLICY system_all ON "AppConfig" USING (thrivie_is_system()) WITH CHECK (thrivie_is_system());
