-- AlterTable
ALTER TABLE "Settings" ADD COLUMN     "calorieTarget" INTEGER,
ADD COLUMN     "proteinTargetG" INTEGER,
ALTER COLUMN "visibleModules" SET DEFAULT 'health,workouts,nutrition,habits,goals,journal';

-- CreateTable
CREATE TABLE "Meal" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "slot" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "calories" INTEGER,
    "proteinG" DOUBLE PRECISION,
    "carbsG" DOUBLE PRECISION,
    "fatG" DOUBLE PRECISION,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Meal_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Meal_userId_date_idx" ON "Meal"("userId", "date");

-- AddForeignKey
ALTER TABLE "Meal" ADD CONSTRAINT "Meal_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Row Level Security: meals are visible and writable only by their owner.
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "Meal" TO thrivie_rls;
ALTER TABLE "Meal" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Meal" FORCE ROW LEVEL SECURITY;
CREATE POLICY owner_all ON "Meal" USING ("userId" = thrivie_uid()) WITH CHECK ("userId" = thrivie_uid());

-- Show the new Nutrition module to existing accounts (they can hide it in Me).
-- Settings has FORCE'd RLS, so this runs under the narrow system context.
SELECT set_config('app.system', 'on', false);
UPDATE "Settings" SET "visibleModules" = "visibleModules" || ',nutrition' WHERE position('nutrition' in "visibleModules") = 0;
SELECT set_config('app.system', '', false);
