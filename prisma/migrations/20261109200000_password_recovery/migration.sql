-- Password recovery: reset links reuse MagicLink with a purpose; recovery keys are stored as hashes.
ALTER TABLE "MagicLink" ADD COLUMN "purpose" TEXT NOT NULL DEFAULT 'signin';
ALTER TABLE "MagicLink" ADD CONSTRAINT "MagicLink_purpose_check" CHECK ("purpose" IN ('signin', 'reset'));
ALTER TABLE "User" ADD COLUMN "recoveryKeyHash" TEXT;
ALTER TABLE "User" ADD COLUMN "recoveryKeyAt" TIMESTAMP(3);
