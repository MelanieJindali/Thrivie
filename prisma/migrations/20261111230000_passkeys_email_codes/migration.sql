-- Passkeys, emailed sign-in codes and how each session signed in. Additive only:
-- existing password hashes and active sessions are not touched.
-- AlterTable
ALTER TABLE "Session" ADD COLUMN     "method" TEXT NOT NULL DEFAULT 'password';

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "hasPassword" BOOLEAN NOT NULL DEFAULT true;

-- CreateTable
CREATE TABLE "Passkey" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "credentialId" TEXT NOT NULL,
    "publicKey" BYTEA NOT NULL,
    "counter" BIGINT NOT NULL DEFAULT 0,
    "transports" TEXT,
    "backedUp" BOOLEAN NOT NULL DEFAULT false,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastUsedAt" TIMESTAMP(3),

    CONSTRAINT "Passkey_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuthChallenge" (
    "id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "subject" TEXT,
    "value" TEXT NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuthChallenge_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Passkey_credentialId_key" ON "Passkey"("credentialId");

-- CreateIndex
CREATE INDEX "Passkey_userId_idx" ON "Passkey"("userId");

-- CreateIndex
CREATE INDEX "AuthChallenge_kind_subject_idx" ON "AuthChallenge"("kind", "subject");

-- AddForeignKey
ALTER TABLE "Passkey" ADD CONSTRAINT "Passkey_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;


ALTER TABLE "Session" ADD CONSTRAINT "Session_method_check" CHECK ("method" IN ('password', 'passkey', 'code'));
ALTER TABLE "AuthChallenge" ADD CONSTRAINT "AuthChallenge_kind_check" CHECK ("kind" IN ('passkey-register', 'passkey-login', 'email-code'));

-- Row-level security: both tables are reachable only by the sign-in system role.
ALTER TABLE "Passkey" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Passkey" FORCE ROW LEVEL SECURITY;
ALTER TABLE "AuthChallenge" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AuthChallenge" FORCE ROW LEVEL SECURITY;
CREATE POLICY system_all ON "Passkey" USING (thrivie_is_system()) WITH CHECK (thrivie_is_system());
CREATE POLICY system_all ON "AuthChallenge" USING (thrivie_is_system()) WITH CHECK (thrivie_is_system());
