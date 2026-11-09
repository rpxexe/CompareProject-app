# CompareProjects — Setup Guide

How to run CompareProjects on your own machine, and how to put it into production.

The project has two parts:

| Part | Folder | What it is |
|---|---|---|
| **Backend API** | `backend/` | Node.js + Express 5 + MongoDB (Mongoose). Serves `/api/...` on port 5000. |
| **Mobile app** | `frontend/` | Expo SDK 54 / React Native 0.81, Android first. Talks to the backend over `EXPO_PUBLIC_API_URL`. |

Shared services: **MongoDB Atlas** (data), **Firebase Authentication** (phone OTP login), **Sentry** (error tracking, optional locally).

---

## Contents

**Part 1 — Local development**
1. [Prerequisites](#1-prerequisites)
2. [Accounts and secrets you need](#2-accounts-and-secrets-you-need)
3. [Backend setup](#3-backend-setup)
4. [Mobile app setup](#4-mobile-app-setup)
5. [Signing in while developing](#5-signing-in-while-developing)
6. [Error tracking (Sentry) in development](#6-error-tracking-sentry-in-development)
7. [Everyday commands](#7-everyday-commands)
8. [Local troubleshooting](#8-local-troubleshooting)

**Part 2 — Production**

9. [Production checklist](#9-production-checklist)
10. [Database (MongoDB Atlas)](#10-database-mongodb-atlas)
11. [Backend deployment (Render)](#11-backend-deployment-render)
12. [Firebase for release builds](#12-firebase-for-release-builds)
13. [Building the app (EAS)](#13-building-the-app-eas)
14. [Publishing to Google Play](#14-publishing-to-google-play)
15. [Sentry in production](#15-sentry-in-production)
16. [After every deploy](#16-after-every-deploy)

---

# Part 1 — Local development

## 1. Prerequisites

| Tool | Version | Needed for |
|---|---|---|
| Node.js | **20.19.4 or newer** (22 LTS recommended) | Backend and app. React Native 0.81 refuses older versions. |
| npm | 10+ | Comes with Node. |
| Git | any | Cloning the repo. |
| Android Studio | latest | Android SDK, platform tools (`adb`) and an emulator if you have no phone. |
| JDK | **17** | Building the Android app. Android Studio ships one (`File → Settings → Build Tools → Gradle → Gradle JDK`). |
| An Android phone with USB debugging, or an emulator | Android 7+ | Running the app. |

Make sure `adb` is on your `PATH` (`adb devices` should list your phone). On Windows it lives in `%LOCALAPPDATA%\Android\Sdk\platform-tools`.

> **Expo Go does not work for this app.** Phone login uses the native Firebase module, which Expo Go doesn't include. You build a development app once (section 4), then reload JavaScript changes instantly like in Expo Go.

## 2. Accounts and secrets you need

Ask the project owner for access, or create your own for a private test setup:

| What | Where to get it | Goes into |
|---|---|---|
| MongoDB connection string | MongoDB Atlas → *Database → Connect → Drivers* | `backend/.env` → `MONGODB_URI` |
| Firebase project id | Firebase console → *Project settings → General* | `backend/.env` → `FIREBASE_PROJECT_ID` |
| Firebase service-account key (JSON) | Firebase console → *Project settings → Service accounts → Generate new private key* | `backend/.env` → `FIREBASE_SERVICE_ACCOUNT` (one line) |
| `google-services.json` | Firebase console → *Project settings → Your apps → Android app `com.compareproject.mobile`* | `frontend/google-services.json` (already in the repo) |
| Sentry DSNs *(optional locally)* | sentry.io → org `brainflow-um` → projects `compareprojects-backend` / `compareprojects-app` → *Settings → Client Keys* | `backend/.env` → `SENTRY_DSN`, `frontend/.env` → `EXPO_PUBLIC_SENTRY_DSN` |

Never commit `.env` files or the service-account JSON. Both are already in `.gitignore`.

## 3. Backend setup

```bash
cd backend
npm install
cp .env.example .env        # Windows PowerShell: Copy-Item .env.example .env
```

Fill in `backend/.env`. Every variable is documented in [`backend/.env.example`](../backend/.env.example); the ones you must set locally are:

```env
NODE_ENV=development
MONGODB_URI=mongodb+srv://<user>:<password>@<cluster-host>/comparedb?retryWrites=true&w=majority
JWT_SECRET=<random, 24+ characters>
FIREBASE_PROJECT_ID=<your-firebase-project-id>
FIREBASE_SERVICE_ACCOUNT=<service-account JSON on one line>
```

- Generate `JWT_SECRET`:
  `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`
- Turn the downloaded service-account file into one line:
  `node -e "console.log(JSON.stringify(require('./firebase-service-account.json')))"`
- If your network can't resolve `mongodb+srv://` addresses, also set `MONGODB_FALLBACK_URI` (see `.env.example`).

Check the database, then start the API:

```bash
npm run check:db     # read-only: connects, pings, counts listings
npm run dev          # starts on port 5000 and restarts on file changes (npm start = no auto-restart)
```

You should see `MongoDB connected` and `API listening on port 5000`. Confirm in a browser: <http://localhost:5000/api/health> → `"database": "connected"`.

Run the tests any time with `npm test` (they use a fake in-memory database, so no MongoDB is needed).

## 4. Mobile app setup

```bash
cd frontend
npm install
cp .env.example .env
```

### 4.1 Point the app at your backend

Set `EXPO_PUBLIC_API_URL` in `frontend/.env` (must end in `/api`):

| How the phone connects | Value |
|---|---|
| **USB cable** (recommended) | `http://localhost:5000/api` |
| Same Wi-Fi as your PC | `http://<your PC's LAN IP>:5000/api`, e.g. `http://192.168.1.34:5000/api` (find it with `ipconfig`) |
| Android emulator | `http://10.0.2.2:5000/api` |

`EXPO_PUBLIC_WEB_URL` can stay empty until the website is live.

After changing anything in `frontend/.env`, restart Metro with a clean cache (`npx expo start -c`); the values are baked in when the code is bundled.

### 4.2 Build and install the development app (first time)

Connect your phone by USB (USB debugging on) or start an emulator, then:

```bash
npm run android
```

This forwards ports 8081 (Metro) and 5000 (backend) to the phone, generates the `android/` project, builds the app and installs it. The first build takes 10–20 minutes; later builds are much faster.

Rebuild with `npm run android` only when **native** things change: new native packages, `app.json` plugins, or `google-services.json`. For JavaScript changes you just save the file.

### 4.3 Daily start

```bash
npm run device       # re-forwards USB ports and starts Metro with a clean cache
```

Open the installed **CompareProjects** app on the phone. If you use Wi-Fi instead of USB, run `npx expo start -c` and make sure the phone and PC are on the same network and Windows Firewall allows port 5000.

## 5. Signing in while developing

**Phone (customer) login** uses Firebase OTP:

1. Firebase console → *Authentication → Sign-in method* → enable **Phone**; under *Settings → SMS region policy* allow India.
2. Add your machine's **debug SHA-1 and SHA-256** to the Firebase Android app (*Project settings → Your apps → Add fingerprint*). Get them with:
   ```bash
   cd frontend/android
   ./gradlew signingReport        # Windows: gradlew signingReport — use the "debug" variant
   ```
3. To avoid real SMS, add **test numbers** with fixed codes under *Authentication → Sign-in method → Phone → Phone numbers for testing*.

**Developer (email/password) accounts** have no public sign-up. Create one from `backend/`:

```bash
npm run create:developer -- --email sales@builder.com --name "Skyline Builders" --phone 9876543210
```

The password is printed once; share it securely. Developers sign in on the Login screen's **Developer** card.

## 6. Error tracking (Sentry) in development

Sentry is **optional** locally:

- **Backend:** reports server errors (5xx) only when `SENTRY_DSN` is set in `backend/.env`. Leave it empty if you don't want local errors in Sentry, or keep `SENTRY_ENVIRONMENT=development` so they're easy to filter.
- **App:** stays **off in development builds** even with `EXPO_PUBLIC_SENTRY_DSN` set. To test reporting from your phone, start Metro with `EXPO_PUBLIC_SENTRY_IN_DEV=true` (put it in `frontend/.env` temporarily, then `npx expo start -c`).

Sentry never receives tokens, passwords, request bodies or IP addresses; reports carry only the account id.

## 7. Everyday commands

| Where | Command | What it does |
|---|---|---|
| `backend/` | `npm run dev` | API with auto-restart |
| `backend/` | `npm test` | Backend test suite |
| `backend/` | `npm run check:db` | Database connectivity check |
| `backend/` | `npm run sync:filters` | Rebuild listings' search-filter fields once |
| `backend/` | `npm run create:developer -- --email ...` | Create a developer account |
| `frontend/` | `npm run device` | Forward USB ports + start Metro (clean cache) |
| `frontend/` | `npm run android` | Rebuild and install the native app |
| `frontend/` | `npm test` | App test suite |
| `frontend/` | `npm run bundle:check` | Check that the production JS bundle builds |

## 8. Local troubleshooting

| Symptom | Fix |
|---|---|
| `Config error: MONGODB_URI is missing` / `JWT_SECRET must be...` | Fill in `backend/.env` (section 3). |
| `MongoServerSelectionError: connection timed out` | Your IP isn't allowed in Atlas → *Network Access → Add IP Address*. |
| `bad auth : authentication failed` | Wrong user/password in `MONGODB_URI`; URL-encode special characters (`@` → `%40`). |
| App shows *Unable to load script … localhost:8081* | Metro isn't running or the USB forward dropped: run `npm run device`. |
| App can't reach the API (network error) | Check `EXPO_PUBLIC_API_URL`, that the backend is running, and (USB) `adb reverse tcp:5000 tcp:5000`. Restart Metro with `-c` after editing `.env`. |
| Login says *Invalid token* | Backend is missing `FIREBASE_PROJECT_ID` / `FIREBASE_SERVICE_ACCOUNT`, or they belong to a different Firebase project than `google-services.json`. |
| OTP never arrives / *app not authorized* | Debug SHA-1/SHA-256 not added in Firebase (section 5), or use a test number. |
| Android build fails after pulling changes | `cd frontend && npx expo prebuild --platform android --clean`, then `npm run android`. |

---

# Part 2 — Production

## 9. Production checklist

Do these in order the first time:

1. **Database** — production Atlas user and network access (section 10).
2. **Backend** — deploy to Render with production environment variables and a persistent disk (section 11).
3. **Firebase** — add the release signing fingerprints (section 12).
4. **App** — set the production API URL and build with EAS (section 13).
5. **Store** — upload to Google Play (section 14).
6. **Monitoring** — confirm Sentry receives production errors (section 15).

## 10. Database (MongoDB Atlas)

- Create a **dedicated database user** for production with a strong password (*Database Access*). Don't reuse developers' credentials.
- *Network Access*: allow your host's outbound IPs. Render's free and standard plans don't have fixed IPs, so most setups use `0.0.0.0/0` together with the strong password.
- Turn on Atlas **backups** for the cluster.
- One-off, only when upgrading an older database: run `npm run migrate:collections` (dry run) and then `npm run migrate:collections -- --apply` from `backend/` with the API stopped. See the main `SETUP.md` for details.

## 11. Backend deployment (Render)

Any Node host works (Railway, a VPS with PM2 + Nginx…); Render is what `eas.json` assumes.

### 11.1 Create the service

Render → *New → Web Service* → connect the GitHub repo, then:

| Setting | Value |
|---|---|
| Root Directory | `backend` |
| Runtime | Node |
| Build Command | `npm ci` |
| Start Command | `npm start` |
| Health Check Path | `/api/health` |
| Instance type | A paid instance is recommended; the free plan sleeps after inactivity, so the first request then takes ~1 minute. |

Set the Node version with the environment variable `NODE_VERSION=22`.

### 11.2 Persistent disk for uploaded photos

Listing photos are saved to `backend/uploads/` on the server's disk. **Render wipes the local disk on every deploy**, so attach a disk (*Disks → Add Disk*, needs a paid instance) with mount path:

```
/opt/render/project/src/backend/uploads
```

Without it, uploaded photos disappear after each deploy.

### 11.3 Environment variables

Set these under *Environment* (never in the repo):

| Variable | Value | Required |
|---|---|---|
| `NODE_ENV` | `production` | yes |
| `MONGODB_URI` | production connection string | yes |
| `MONGODB_COLLECTION` | `properties` | yes |
| `JWT_SECRET` | new random 64-character string (not the dev one) | yes |
| `FIREBASE_PROJECT_ID` | Firebase project id | yes |
| `FIREBASE_SERVICE_ACCOUNT` | service-account JSON on one line | yes |
| `TRUST_PROXY` | `1` (Render has one proxy in front) | yes |
| `PUBLIC_URL` | public https origin of the API, e.g. `https://api.compareprojects.com` | recommended (image URLs) |
| `CORS_ORIGINS` | website origins, comma-separated; empty if only the app uses the API | optional |
| `FILTER_SYNC_MINUTES` | `10` | optional |
| `SENTRY_DSN` | DSN of `compareprojects-backend` | recommended |
| `SENTRY_ENVIRONMENT` | `production` | recommended |
| `SENTRY_TRACES_SAMPLE_RATE` | `0.1` to trace 10% of requests, `0` for errors only | optional |

Render's port is detected automatically; don't set `PORT`. Errors are tagged with the deployed git commit automatically (`RENDER_GIT_COMMIT`).

### 11.4 Verify

```bash
curl https://<your-service>.onrender.com/api/health     # → {"ok":true}
curl "https://<your-service>.onrender.com/api/properties?limit=1"
```

Add a custom domain (*Settings → Custom Domains*) if you want `api.yourdomain.com`; Render issues the HTTPS certificate.

## 12. Firebase for release builds

Release apps are signed with a different key than your debug build, so phone login fails until Firebase knows the release fingerprints:

1. **EAS upload key:** `cd frontend && eas credentials` → *Android → production → Keystore* → copy SHA-1 and SHA-256.
2. **Google Play app signing key** (after the first Play upload): Play Console → *App integrity → App signing* → copy SHA-1 and SHA-256.
3. Add all of them in Firebase → *Project settings → Your apps → Android app → Add fingerprint*.
4. Download the updated `google-services.json` into `frontend/` and commit it.
5. Remove test phone numbers you don't want working in production, and check *Authentication → Settings → SMS region policy*.

## 13. Building the app (EAS)

### 13.1 One-time setup

```bash
npm install -g eas-cli
eas login
cd frontend
eas init            # links the project to your Expo account (adds the project id to app.json)
```

### 13.2 Configure the build

EAS does **not** read `frontend/.env` (it's git-ignored and isn't uploaded). Build settings come from [`frontend/eas.json`](../frontend/eas.json):

- Replace `https://YOUR-BACKEND.onrender.com/api` in both the `preview` and `production` profiles with your real API URL (ends in `/api`).
- `EXPO_PUBLIC_SENTRY_DSN`, `SENTRY_ORG` and `SENTRY_PROJECT` are already set.
- Add `EXPO_PUBLIC_WEB_URL` to the `env` blocks once the website is live.

Store the Sentry auth token as an EAS secret so release crash reports have readable file names and line numbers (create it at <https://brainflow-um.sentry.io/settings/auth-tokens/>):

```bash
eas env:create --name SENTRY_AUTH_TOKEN --value <token> --environment production --environment preview --visibility secret
```

No token? Set `SENTRY_DISABLE_AUTO_UPLOAD=true` in the profile's `env` instead, or the build may fail at the upload step.

### 13.3 Version numbers

Before every store release, bump in `frontend/app.json`:
- `expo.version` (shown to users, e.g. `2.0.1`)
- `expo.android.versionCode` (must increase by at least 1 each upload)

### 13.4 Build

```bash
eas build --platform android --profile preview      # installable APK for testers
eas build --platform android --profile production   # .aab for Google Play
```

Install the preview APK on a phone and test login, listings, enquiries and photo upload against the production API before submitting.

> iOS isn't configured yet (no `GoogleService-Info.plist` and no Apple setup). It needs a Firebase iOS app and an Apple Developer account before `--platform ios` will work.

## 14. Publishing to Google Play

1. Create the app in Play Console with package name `com.compareproject.mobile`.
2. First upload: download the `.aab` from the EAS build page and upload it manually under *Test and release → Internal testing*. This also turns on Play App Signing (then do step 2 of section 12).
3. Later uploads: `eas submit --platform android --latest` (needs a Google Play service-account key; see `eas submit` docs).
4. Promote from internal testing → closed/open testing → production once checks pass.

## 15. Sentry in production

Projects live in the Sentry organization **brainflow-um**:

| Project | Platform | Configured by |
|---|---|---|
| `compareprojects-backend` | Express | `SENTRY_DSN` on Render |
| `compareprojects-app` | React Native | `EXPO_PUBLIC_SENTRY_DSN` in `eas.json`, auth token as EAS secret |

What gets reported:
- **Backend:** server errors (5xx), crashes and start-up failures, tagged with route, account id and release (git commit). Client mistakes (4xx) are not reported.
- **App:** JavaScript errors and native crashes, with the screens visited and taps before the error, the account id, and the release `com.compareproject.mobile@<version>+<versionCode>`.

Recommended once:
- In each project → *Settings → Security & Privacy*, turn on **Prevent Storing of IP Addresses**.
- Set up alerts (*Alerts → Create Alert*), e.g. email or Slack on every new issue.

## 16. After every deploy

- [ ] `GET /api/health` returns `{"ok":true}`.
- [ ] Log in with a real phone number on a release build.
- [ ] Open a listing, send an enquiry, upload a photo, and check the photo still loads after the next deploy.
- [ ] Sentry shows no new issues for the release (filter by `environment:production`).
- [ ] Secrets were rotated if they were ever shared in chat or email (MongoDB password, `JWT_SECRET`, Firebase key, Sentry token).
