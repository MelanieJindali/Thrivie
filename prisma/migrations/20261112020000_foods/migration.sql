-- Food scanner, step 1: foods (shared product cache + private custom foods), favorites, and
-- a food reference with a fuller nutrition snapshot on meal entries. Additive only.
-- AlterTable
ALTER TABLE "Meal" ADD COLUMN     "foodId" TEXT,
ADD COLUMN     "nutrients" TEXT,
ADD COLUMN     "servings" DOUBLE PRECISION;

-- CreateTable
CREATE TABLE "Food" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "source" TEXT NOT NULL,
    "barcode" TEXT,
    "found" BOOLEAN NOT NULL DEFAULT true,
    "name" TEXT NOT NULL,
    "brand" TEXT,
    "servingSize" TEXT,
    "servingGrams" DOUBLE PRECISION,
    "perServing" TEXT,
    "per100g" TEXT,
    "allergens" TEXT NOT NULL DEFAULT '',
    "traces" TEXT NOT NULL DEFAULT '',
    "fetchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Food_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FavoriteFood" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "foodId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FavoriteFood_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Food_barcode_idx" ON "Food"("barcode");

-- CreateIndex
CREATE INDEX "Food_userId_idx" ON "Food"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "FavoriteFood_userId_foodId_key" ON "FavoriteFood"("userId", "foodId");

-- AddForeignKey
ALTER TABLE "Meal" ADD CONSTRAINT "Meal_foodId_fkey" FOREIGN KEY ("foodId") REFERENCES "Food"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Food" ADD CONSTRAINT "Food_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FavoriteFood" ADD CONSTRAINT "FavoriteFood_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FavoriteFood" ADD CONSTRAINT "FavoriteFood_foodId_fkey" FOREIGN KEY ("foodId") REFERENCES "Food"("id") ON DELETE CASCADE ON UPDATE CASCADE;


ALTER TABLE "Food" ADD CONSTRAINT "Food_source_check" CHECK ("source" IN ('open_food_facts', 'label_scan', 'custom', 'generic'));
-- Shared rows are only ever cached products or generic foods; anything a person typed or scanned from a label is theirs.
ALTER TABLE "Food" ADD CONSTRAINT "Food_shared_source_check" CHECK ("userId" IS NOT NULL OR "source" IN ('open_food_facts', 'generic'));
-- One shared row per barcode, and one private row per person per barcode.
CREATE UNIQUE INDEX "Food_shared_barcode_key" ON "Food"("barcode") WHERE "userId" IS NULL AND "barcode" IS NOT NULL;
CREATE UNIQUE INDEX "Food_owner_barcode_key" ON "Food"("userId", "barcode") WHERE "userId" IS NOT NULL AND "barcode" IS NOT NULL;

ALTER TABLE "Food" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Food" FORCE ROW LEVEL SECURITY;
ALTER TABLE "FavoriteFood" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "FavoriteFood" FORCE ROW LEVEL SECURITY;
-- Private foods: only their owner, for everything.
CREATE POLICY owner_all ON "Food" USING ("userId" = thrivie_uid()) WITH CHECK ("userId" = thrivie_uid());
-- Shared foods: any signed-in person may read them; only the lookup service may write them, and it can't touch private rows.
CREATE POLICY shared_read ON "Food" FOR SELECT USING ("userId" IS NULL AND thrivie_uid() IS NOT NULL);
CREATE POLICY system_shared ON "Food" USING (thrivie_is_system() AND "userId" IS NULL) WITH CHECK (thrivie_is_system() AND "userId" IS NULL);
CREATE POLICY owner_all ON "FavoriteFood" USING ("userId" = thrivie_uid()) WITH CHECK ("userId" = thrivie_uid());
