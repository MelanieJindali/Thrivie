-- AlterTable
ALTER TABLE "Settings" ADD COLUMN     "hideCalories" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "BodyProfile" (
    "userId" TEXT NOT NULL,
    "data" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BodyProfile_pkey" PRIMARY KEY ("userId")
);

-- CreateTable
CREATE TABLE "MealPlan" (
    "userId" TEXT NOT NULL,
    "weekStart" TEXT NOT NULL,
    "data" TEXT NOT NULL,
    "profileHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MealPlan_pkey" PRIMARY KEY ("userId","weekStart")
);

-- AddForeignKey
ALTER TABLE "BodyProfile" ADD CONSTRAINT "BodyProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MealPlan" ADD CONSTRAINT "MealPlan_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Row Level Security: only the owner can read or change their profile and plans.
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "BodyProfile", "MealPlan" TO thrivie_rls;
ALTER TABLE "BodyProfile" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "BodyProfile" FORCE ROW LEVEL SECURITY;
ALTER TABLE "MealPlan" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "MealPlan" FORCE ROW LEVEL SECURITY;
CREATE POLICY owner_all ON "BodyProfile" USING ("userId" = thrivie_uid()) WITH CHECK ("userId" = thrivie_uid());
CREATE POLICY owner_all ON "MealPlan" USING ("userId" = thrivie_uid()) WITH CHECK ("userId" = thrivie_uid());
