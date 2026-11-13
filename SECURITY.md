# Security and privacy at Thrivie

Thrivie stores health information, so every layer assumes it is sensitive. This document describes what is protected, how, and how to report a problem.

## Reporting a vulnerability

Please email the maintainer privately (see the GitHub profile) rather than opening a public issue. Include steps to reproduce. We aim to acknowledge reports within 3 days.

## Data isolation between users

Two independent layers mean one user can never read or change another user's data, even if one layer has a bug.

1. **Database: Row Level Security.** RLS is enabled *and forced* on every table (`prisma/migrations/*_rls`).
   - Each query runs in a transaction that sets the current user id and switches to the restricted role `thrivie_rls`. That role cannot bypass RLS, even when the connecting role can, as many hosted Postgres roles can.
   - Policies only expose rows whose `userId` matches.
   - Child rows (exercises, check-ins, goal progress) are reachable only through a parent the user owns.
   - Goals can only link to the same user's habit, and attachments to the same user's journal entry.
   - With no user set, user tables return nothing (fail closed).
   - The narrow *system* context used by sign-in, the reminders job and token lookup can read only the tables those jobs need. It can never read health, workout, meal, habit, goal or journal data.
2. **Application: a scoped data client** (`src/lib/db.ts`). The same queries are also rewritten to filter by the user and to stamp the user on new rows. Changing a row's owner is rejected. Raw SQL and the unscoped client aren't exposed to app code.

`tests/isolation.test.ts` proves both layers against a real Postgres database. The database-alone checks use raw SQL that skips every application check, with the connecting role deliberately allowed to bypass RLS.

## Encryption

- **In transit:** HTTPS only, with HSTS (`max-age=2 years; includeSubDomains; preload`). Use `upgrade-insecure-requests`.
- **At rest (application level):** the Body & Goals profile (height, weight, age, sex, pregnancy, diet, allergies), saved meal plans, journal text, meal names, health/workout/meal notes, goal-progress notes, photos and voice notes are encrypted with **AES-256-GCM** before they reach the database (`src/lib/crypto.ts`).
  - Each value gets a random IV.
  - The user id is bound as authenticated data, so a ciphertext copied into another user's row won't decrypt. Tampering is detected.
  - Keys live only in environment secrets (`ENCRYPTION_KEY`, plus `ENCRYPTION_KEY_PREVIOUS` for rotation). Production refuses to start without one.
  - Encrypted journal entries are searched by decrypting the owner's own entries on the server, never in SQL.
- **Hosting:** your database provider (Neon, Supabase) also encrypts disks at rest.

## Accounts and sessions

- **Passwords:**
  - Hashed with scrypt (N=2^15, r=8, p=1) and a random salt.
  - At least 10 characters, and not the user's email name or a common password.
  - Checked against known breaches with the Have I Been Pwned *k-anonymity* API: only the first 5 characters of the SHA-1 hash leave the server, never the password.
- **Sessions:**
  - A random 256-bit token in an `httpOnly`, `Secure`, `SameSite=Lax`, `__Host-` prefixed cookie. Only its SHA-256 is stored.
  - Sessions last 30 days. Changing your password signs out all other devices, and "Sign out everywhere" is available.
  - The token is replaced once a day (rotation), renewing the 30 days. The previous token keeps working for one minute so requests already in flight aren't signed out.
- **Two-step verification (optional):**
  - Authenticator-app codes (TOTP), with the secret stored encrypted.
  - Each code is single-use, and failed attempts are rate-limited.
  - 8 one-time recovery codes, stored as hashes.
- **Passkeys (Face ID, Touch ID, screen lock):**
  - WebAuthn, verified with the SimpleWebAuthn library. The private key never leaves the device; the server stores only the public key.
  - Biometric or screen-lock confirmation is required every time, and the signature is bound to this site's address, so a passkey can't be phished or replayed on another site.
  - Each challenge is random, stored server-side, expires in 5 minutes and is deleted on first use.
  - A passkey sign-in already proves both the device and its owner, so it doesn't ask for a second code.
- **Emailed sign-in codes (optional, needs an email provider):**
  - Six digits, valid for 10 minutes, single-use, stored only as a hash. A new code cancels the previous one.
  - A code is cancelled after 5 wrong guesses; requests and failed attempts are also rate-limited per email and per network.
  - Two-step verification, when turned on, is still required after a code.
  - Requests always get the same response, so they never reveal whether an account exists.
- **Passwords remain supported.** Existing accounts sign in exactly as before; nothing about stored password hashes changed. New accounts may skip the password, in which case no password can sign in to them until one is set.
- **Forgotten passwords:**
  - *Reset link by email* (needs an email provider): single-use, valid for 30 minutes, stored as a hash, carried in the URL fragment so it never appears in server logs, and used by a button press so email link scanners can't use it up. Using one also cancels any other open reset links for that account. A reset link can only reset a password; it can't sign anyone in.
  - *Recovery key* (works without email): 20 random characters (100 bits), created from Me → Account after re-entering the password, shown once and stored only as a SHA-256 hash. Using it to reset issues a new key, so each key works once. Failed attempts are rate-limited per email and per network.
  - Both ways reset the password inside one database transaction that also signs out every device, and both are safe against two requests racing to use the same link or key. Two-step verification is still required at the next sign-in, so a reset never bypasses it.
  - When email is set up, the account gets a "your password was changed" notice after any change or reset.
- **Account enumeration:** sign-in, reset-link requests and recovery-key resets give the same answer whether or not the email exists, and sign-in does the same work either way.
- **Sign-ups:** can be invite-only (`SIGNUP_CODE`) or closed (`ALLOW_SIGNUP=false`).

## Request protection

- **Rate limits** are stored in the database, so they work across serverless instances, and their keys are hashed:
  - failed sign-ins per email and per network (only failures count)
  - two-step codes
  - sign-in code requests and guesses, and reset-link requests
  - passkey sign-in attempts
  - recovery-key resets and new recovery keys
  - sign-ups per network
  - writes per user
  - uploads per user
  - health-sync per token
- **CSRF:** Server Actions use Next.js's built-in origin check. Cookie-authenticated API writes must be same-origin (`Sec-Fetch-Site`/`Origin`, checked in `src/middleware.ts`). Token-authenticated endpoints (`/api/ingest`, `/api/cron`) don't use cookies.
- **Validation:** every input is validated on the server with Zod (types, ranges, lengths, enums). Request bodies have hard size limits that are enforced while reading (`src/lib/body.ts`).
- **Security headers:**
  - a strict Content Security Policy with a per-request nonce (`script-src 'nonce-…' 'strict-dynamic'`, `object-src 'none'`, `frame-ancestors 'none'`, `base-uri 'self'`, `form-action 'self'`)
  - `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `Cross-Origin-Opener-Policy` and `Cross-Origin-Resource-Policy: same-origin`
  - a restrictive `Permissions-Policy`: microphone and camera for this site only, everything else off
- **No caching of personal data:** API responses are `private, no-store`. The service worker never caches API calls or auth pages, and cached pages and the offline queue are cleared on sign-out.

## Smart Import and on-device AI

- Pasted notes are parsed **on the device** (Tier 1, rule-based). The raw text is never sent to the server. Only entries the user approves are saved. The duplicate check fetches only the user's own existing entries for the dates involved and compares them locally.
- The optional on-device AI (Chrome's built-in model, or Transformers.js in a Web Worker) only sees the note parts Tier 1 couldn't read, or the day's brief. Inference never leaves the device; there is no AI API on the server.
  - Enhanced note lines replace the original text in the note and go back through Tier 1 and the normal review; nothing is saved without approval.
  - A brief rewrite is discarded if it uses a number that isn't in the brief or adds weight, food or medical wording.
  - Any failure falls back to the original text.
  - Downloading the model contacts Hugging Face (huggingface.co and its file CDN under hf.co), allowed in the CSP's connect-src. No personal data is sent. The ONNX runtime files are self-hosted.
- Pasted text and model output are treated as untrusted and are only ever rendered as text, never as HTML.

## Food scanner

- **Images stay on the device.** Camera frames and label photos are processed in the browser (barcode reader, Tesseract in a Web Worker). They are never uploaded or stored on the server.
- **What leaves Thrivie:** a product's barcode number, or the words of an online name search you start, sent from Thrivie's server to Open Food Facts with a descriptive User-Agent and no account details. Lookups are cached and rate-limited.
- **Shared and private food data:** cached products are public product data, readable by every signed-in person and writable only by the lookup service. Foods you enter or read from a label are private rows with encrypted names; tests run raw SQL as a second user to prove they can't be read or changed.
- **Engine files are self-hosted** under `/vendor`, so no third-party CDN is contacted, and they load only when the scanner is opened.
- **Camera:** requested only from the scanner, and stopped when the scanner closes or the app goes to the background.
- **On this device:** products you've scanned are kept in the browser's storage for offline use and cleared on sign-out.

## Logging and secrets

- Health values, journal text and pasted notes are never logged. Database errors can echo the values being written, so error logging records only the error type and code (`src/lib/log.ts`). Query logging is off.
- Secrets live only in environment variables, never in code or in the repository (`.env` is git-ignored). Push-notification keys are generated server-side and stored in a system-only table.

## Your controls

Export everything as JSON or per-table CSV, delete all entries, or permanently delete your account. Deleting an account removes every row it owns through database cascades. Deleting an account is the one action that asks for confirmation, by password and typed email; other deletions use an Undo toast.

## Dependencies

`npm audit --omit=dev` reports 0 known vulnerabilities at the time of writing. Patched versions of PostCSS (bundled inside Next.js) and deepmerge-ts (used by the Prisma CLI) are forced through `overrides` in `package.json`. Run `npm audit` before each deploy.

## Not medical advice

Thrivie is for personal tracking only and doesn't provide medical advice.
