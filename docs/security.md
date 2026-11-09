# CompareProjects — Security

What the app already does to protect users, accounts and data, and what we still plan to add. Every "already in place" item is in the code today, and most are covered by automated tests (`backend/test/security.test.js`, `hardening.test.js`, `rate-limit.test.js`, `uploads.test.js`, `firebase.test.js`, `own-listing.test.js`, `startup.test.js`).

Last reviewed: November 2026.

## Contents

**Already in place**
1. [Sign-in and sessions](#1-sign-in-and-sessions)
2. [Passwords (developer accounts)](#2-passwords-developer-accounts)
3. [Roles and permissions](#3-roles-and-permissions)
4. [Rate limiting and abuse protection](#4-rate-limiting-and-abuse-protection)
5. [Input validation](#5-input-validation)
6. [Listings: who can see and change what](#6-listings-who-can-see-and-change-what)
7. [Photo uploads](#7-photo-uploads)
8. [Links inside listings](#8-links-inside-listings)
9. [API hardening](#9-api-hardening)
10. [Configuration and secrets](#10-configuration-and-secrets)
11. [Mobile app](#11-mobile-app)
12. [Error tracking without personal data](#12-error-tracking-without-personal-data)
13. [Source code](#13-source-code)

**Planned / recommended**

14. [Before production launch](#14-before-production-launch)
15. [Further improvements](#15-further-improvements)

---

# Already in place

## 1. Sign-in and sessions

- **Phone login is handled by Firebase Authentication.** Firebase sends the SMS and checks the 6-digit code. Our backend never sends SMS, never sees the code and never stores it. The old self-built OTP endpoints have been removed.
- **Every Firebase token is fully verified** on the server, including a revocation check (`checkRevoked`). Revoked, expired, disabled or malformed tokens all get the same plain `401`, so attackers learn nothing about why.
- **App session tokens (JWT) are locked to one algorithm (HS256).** Tokens signed any other way, including the classic `alg: none` trick, are rejected.
- **"Log out" signs you out everywhere.** Each account has a token version. Logging out bumps it, so every token ever issued to that account stops working on all devices, and the linked Firebase session is revoked too. An admin can force the same by increasing `tokenVersion` on the account.
- **Account linking is strict.** A new Firebase login is joined to an existing account only when the phone number is **verified by Firebase** and matches. An email or an unverified phone that happens to match is never enough to take over someone else's account.

## 2. Passwords (developer accounts)

- **There is no public sign-up for developers.** An administrator creates each account with `npm run create:developer`.
- The password is **randomly generated and shown once**. Only a hash is stored.
- **Hashing uses `scrypt`** with a random salt per password. Comparison is timing-safe, so response time doesn't reveal how close a guess was.
- **Failed sign-ins are throttled** per account and per IP address.
- Sign-in with an unknown email never creates an account. Over-long emails (over 254 characters, up to huge 150 KB ones) are rejected immediately, never "trimmed" into a different address.

## 3. Roles and permissions

- **Users can't give themselves a role.** Choosing "broker" as a purpose sets only the broker role; nobody can make themselves an admin or developer.
- **Phone logins never change a role.** Roles are managed only in the CRM.

## 4. Rate limiting and abuse protection

- **Search, counts and insights** are limited per client.
- **Enquiries, reviews, new listings, edits, uploads and leads** are limited per user. **Sign-in, registration and "log out everywhere"** have their own limits.
- Blocked requests get `429 Too Many Requests` with a `Retry-After` header, and the limiter's memory use is capped so it can't be used to exhaust the server.
- **Leads are de-duplicated for 24 hours,** so the same form can't flood a builder.
- **The client's IP can't be spoofed to dodge limits.** The number of trusted proxies is explicit (`TRUST_PROXY`); clients can't fake their address with an `X-Forwarded-For` header.

## 5. Input validation

- **Request bodies are validated with schemas (Zod)** for enquiries, listings, profiles, sign-up, customer and lead endpoints. Bad input gets a clear `400`, never a crash.
- **Request bodies are capped at 200 KB,** and invalid JSON returns a `400`.
- **Database-injection protection:** search text is regex-escaped before it reaches MongoDB, IDs must match the exact ID format, and malformed query values (arrays, objects, junk) are handled safely instead of reaching the database as operators.
- **Internal errors never leak.** A database failure returns a generic "Something went wrong" (`500`), never the raw error, stack trace or connection details.

## 6. Listings: who can see and change what

- **Hidden or rejected listings return `404` on every route,** exactly like an ID that doesn't exist, so hidden listings can't be discovered. The owner can still open their own.
- **Users can see and edit only their own listings.** Other people's listings and imported listings are "not found".
- **No self-approval.** Editing a rejected listing keeps it rejected.
- **Location, BHK and property type are locked** after posting, so an approved listing can't be turned into something else.
- A listing that gets hidden also disappears from everyone's saved list.

## 7. Photo uploads

- **Only signed-in users can upload,** and uploads are rate limited.
- **Strict limits:** one file per request, 8 MB maximum, JPEG/PNG/WebP only, and a pixel cap that blocks "decompression bomb" images.
- **Every photo is re-encoded to a clean JPEG.** This **removes EXIF data, including GPS location**, applies the correct orientation and resizes it to at most 2560 px.
- **Files that lie about their type, non-images and corrupt images are rejected** and never kept.
- Photos are served with `nosniff` and fixed image extensions, so they can only ever be treated as images, and directory listing is off.
- **Deleting a listing deletes its photos,** but never one another listing still uses.

## 8. Links inside listings

Brochure, map, virtual-tour and image links come from listing data we don't fully control. A malicious link could start a UPI payment, a phone call or another app.

- **The API accepts only `https://` links** when listings are posted or edited (`http`, `data:`, `file:` and `javascript:` are rejected), and never hands the app a non-https link from imported data.
- **The app checks again before opening anything** (`frontend/src/utils/links.js`). Only absolute `https://` addresses are handed to the phone; `upi:`, `tel:`, `intent:`, `javascript:`, `file:` and custom schemes are refused, as are links hiding credentials (`https://good.com@evil.com`) and over-long URLs.

## 9. API hardening

- **Security headers on every response** (Helmet): HSTS for one year, `X-Frame-Options: DENY`, `Referrer-Policy: no-referrer`, `X-Content-Type-Options: nosniff`. The `X-Powered-By` header is removed.
- **CORS is closed by default in production.** With no allowed origins configured, no CORS headers are sent at all, so browsers on other sites can't call the API; only listed website origins are allowed.
- **The health check reveals nothing in production.** It answers only `{"ok": true}`; database state and other details are shown only in development.
- Unknown routes return a plain JSON `404`.

## 10. Configuration and secrets

- **The server refuses to start without a database address or with a weak `JWT_SECRET`** (fewer than 24 characters), in every environment.
- **A missing or misspelt `NODE_ENV` is treated as production,** so a forgotten setting never switches on development conveniences like open CORS.
- **Start-up failures are clean:** an unreachable database fails fast with a clear message, without crash loops and without printing the connection string.
- **Secrets are never committed:** `.env` files and Firebase admin keys are in `.gitignore`. Firebase errors are logged by code only, never with the token.

## 11. Mobile app

- **The session token is stored in the phone's secure storage** (`expo-secure-store`, backed by the Android Keystore), not in plain app storage.
- **Logging out wipes local data:** the session, Firebase sign-in, search history, compare list, saved locations and filters.
- **App data is excluded from Android backups** (`allowBackup: false`), so it can't be copied off the phone through a backup.
- **Release builds talk only to the configured API address.** There is no hidden fallback to a local or guessed server.
- **Firebase App Check is installed** (`frontend/src/services/appCheck.js`). Release builds prove to Firebase that requests come from the genuine app using **Play Integrity**; debug builds use a debug token. Once enforced in the Firebase console (section 14), a stolen API key can't be used to send OTP texts.

## 12. Error tracking without personal data

Crashes and server errors are reported to Sentry so we can fix them quickly, while personal data stays out:

- **Not sent:** passwords, OTPs, request bodies, cookies, login tokens (`Authorization` headers are filtered), IP addresses, database query values, and code variables.
- **Sent:** the error and where it happened, the screen or API route, the app version, the device model, and the user's **account id only** (no name, phone or email).
- Client mistakes (`4xx`) aren't reported, only real failures, and development errors from the app stay off unless switched on deliberately.

## 13. Source code

- The GitHub repository is **private** (since 9 November 2026).
- The Firebase project and MongoDB database used during development are **temporary** and will be replaced before launch (section 14), because their keys were visible while the repo was public.

---

# Planned / recommended

## 14. Before production launch

These are required. Step-by-step instructions are in [setup.md, section 10](setup.md#10-production-accounts-new-firebase-project-and-database).

| # | Action | Why |
|---|---|---|
| 1 | **New Firebase project** for production. | Development keys were public for a while. |
| 2 | **Restrict its Android API key** to package `com.compareproject.mobile` + release SHA-1s, and to the Identity Toolkit, Token Service and Firebase Installations APIs. | A copied key becomes useless outside our app. |
| 3 | **SMS region policy: India only,** plus a **billing budget alert**. | Blocks SMS-fraud ("toll fraud") that runs up the bill. |
| 4 | **Register the app in App Check (Play Integrity), monitor, then Enforce** for Authentication. | Only genuine installs can request OTPs. The app side is already done. |
| 5 | **New MongoDB database and user** with an autogenerated password, stored only in Render's settings. | The development password exists in old git history. |
| 6 | **New `JWT_SECRET` and Firebase admin key,** only in Render's settings. | Never reuse development secrets. |
| 7 | **Delete the temporary database and the development Firebase key** once production works. | Removes the old exposed credentials completely. |
| 8 | **Sentry: turn on "Prevent Storing of IP Addresses"** in both projects. | Sentry discards IPs even if it detects them. |

## 15. Further improvements

Ordered by value for effort:

1. **Verify App Check on our own API.** Today App Check protects Firebase (SMS). The backend could also check the App Check token (`firebase-admin` → `appCheck().verifyToken`) on sensitive endpoints such as registration, leads and enquiries, so bots can't call them directly.
2. **Keep dependencies patched.** `npm audit` currently reports 8 moderate issues in the backend, and 23 in the app (9 high, mostly in build tooling). Review them, update where safe, and turn on **Dependabot** alerts in GitHub.
3. **Stop secrets before they're committed.** Add a pre-commit secret scanner (e.g. `gitleaks`), or GitHub **push protection** if the plan includes it.
4. **Shared rate limiting.** Limits are kept in each server's memory. If the backend ever runs on more than one instance, move them to Redis so limits apply across all instances.
5. **Move photos to object storage** (e.g. S3 or Cloudflare R2) with private buckets and signed URLs. This also fixes Render's disk being wiped on deploy.
6. **Least-privilege database user:** give the API's Atlas user read/write on the app's database only, not on every database.
7. **Shrink and obfuscate release builds:** enable R8 (`minifyEnabled`) for Android release builds. This makes the app harder to reverse-engineer; keep the ProGuard mapping for Sentry.
8. **Alerts and audit logs:** Sentry alerts for new or spiking issues; Atlas and Firebase activity alerts; a log of admin actions (role changes, account revocations) in the CRM.
9. **Regular reviews:** rotate secrets yearly or when someone with access leaves, and re-check this document at every major release.
