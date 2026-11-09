# CompareProjects

A real-estate mobile app for India: discover, compare and post properties. Android first, built with **React Native (Expo)**, backed by a **Node.js / Express / MongoDB** API.

> **Setting it up?** Read **[docs/setup.md](docs/setup.md)**: step-by-step local setup and production deployment.
> **Security?** Read **[docs/security.md](docs/security.md)**: what's protected and what's planned.

---

## What the app does

| Area | What users get |
|---|---|
| **Home** | Greeting, city selector, search, quick property-type chips, Featured / New launches / Top rated / Upcoming rails, popular cities, recently added. |
| **Search** | Text search with filters (price, BHK, property type, possession, furnishing, area, amenities…), sorting, and listings near your location. |
| **Compare** | Pick up to 4 projects and see them side by side: price, BHK, area, possession, parking, amenities, RERA, rating. Missing data shows `N/A`. |
| **Property details** | Photo gallery, key facts, developer, RERA, amenities, floor plans, virtual tour, brochure, map, save, compare, share, and a sticky **Enquire Now**. |
| **Ratings & reviews** | 1–5 stars with an optional comment, one per user per property (editable). Owners can't rate their own listing. |
| **Post property** | A validated form with photo upload. Listings go live in the shared `properties` collection. |
| **New projects** | New Launch / Upcoming / Under Construction / Ready to Move. A category appears only when there's data for it. |
| **Profile** | Saved properties, my listings, my enquiries, notifications, settings, log out. |
| **Sign-in** | Customers: **mobile number + OTP** (Firebase). Builders: **developer email + password** (accounts created by an admin). |

All listings come from the real database through the API; the app contains no demo or fake listings.

## How it fits together

```
 Android app (Expo / React Native)
   │  phone OTP ───────────────► Firebase Authentication (+ App Check)
   │  REST /api/...
   ▼
 Backend API (Node.js / Express)  ──► MongoDB Atlas (listings, accounts, enquiries…)
   │                                   ▲
   └─ verifies Firebase tokens          └─ shared with the website/scraper and the CRM
 App + API errors ──► Sentry (brainflow-um)
```

- **Customers** sign in with Firebase phone OTP; the app swaps the Firebase token for an app session at `POST /api/v2/customers/register`.
- **The CRM** (separate project) manages staff, roles and enquiries by reading MongoDB directly; this API has no admin routes.

## Tech stack

| Part | Technology |
|---|---|
| Mobile app | Expo SDK 54, React Native 0.81, React Navigation 7, React Native Firebase (Auth, App Check), Sentry |
| Backend | Node.js 20.19+, Express 5, Mongoose 8, Zod validation, Helmet, sharp (image processing), Firebase Admin, Sentry |
| Database | MongoDB Atlas |
| Builds & hosting | EAS Build (app), Render (API) |

## Repository layout

```
backend/                 API server
  src/
    server.js            start-up (loads Sentry first, connects MongoDB)
    app.js               Express app: security headers, CORS, routes
    instrument.js        Sentry set-up
    config/              environment and database
    routes/ controllers/ API endpoints (v1 for the app, v2 = mobile API contract)
    middleware/          auth (JWT + Firebase), error handling
    models/              MongoDB models
    utils/               validation, rate limiting, uploads, search helpers
  scripts/               check-db, create-developer, sync-filters, migrate-collections
  test/                  automated tests (no database needed)
frontend/                Android app
  App.js                 root: Sentry, App Check, providers, navigation
  src/
    screens/ components/ UI
    navigation/          app navigator
    context/             auth, saved, compare, toast, location state
    services/            API client, Firebase phone auth, App Check, Sentry
    utils/ theme/        helpers and design tokens
  app.json  eas.json     Expo and EAS build config
docs/                    setup.md, security.md
```

## Quick start (local)

You need Node.js 20.19+, Android Studio (SDK + `adb`), and a phone with USB debugging or an emulator. Full details and troubleshooting are in [docs/setup.md](docs/setup.md).

```bash
# 1. Backend
cd backend
npm install
cp .env.example .env          # fill in MONGODB_URI, JWT_SECRET, FIREBASE_* (see docs/setup.md §3)
npm run check:db              # confirms the database connection
npm run dev                   # http://localhost:5000/api/health

# 2. App (second terminal, phone connected by USB)
cd frontend
npm install
cp .env.example .env          # EXPO_PUBLIC_API_URL=http://localhost:5000/api
npm run android               # first time: builds and installs the app (10–20 min)
npm run device                # every day after that: starts the dev server
```

**Expo Go won't work:** phone login needs Firebase's native module, so the app runs as its own development build (`npm run android`).

## Accounts and roles

| Account | Signs in with | Created by | Stored in |
|---|---|---|---|
| Customer (`user` / `broker`) | Phone + OTP (Firebase) | Automatically on first sign-in | `app_customers` |
| Developer (builder) | Email + password | Admin: `npm run create:developer -- --email ... --name "..."` | `app_users` |

- Choosing **Broker** as a purpose gives the `broker` role. Users can't give themselves any other role; staff roles are managed in the CRM.
- Developers only post and manage listings for sale.
- **Log out** signs the account out on every device.

## Data

The API **reads** the shared `properties` collection (also filled by the website/scraper) and writes new listings to it. Its own collections:

| Collection | Contents |
|---|---|
| `app_customers` | Phone (customer) accounts |
| `app_users` | Email/password accounts (developers) |
| `enquiries` | Enquiries from the app (read by the CRM) |
| `customer_leads` | Contact forms from `/api/v2/leads/customer` (read by the CRM) |
| `reviews`, `property_ratings` | Ratings and reviews |
| `notifications` | In-app notifications |

## API overview

- **Health:** `GET /api/health`
- **Auth:** `POST /api/v2/customers/register` (Firebase phone sign-in) · `POST /api/auth/signin` (developers) · `POST /api/auth/logout-all`
- **User:** `GET|PATCH /api/users/me` · `GET /api/users/me/properties` · `GET /api/users/me/enquiries`
- **Properties:** `GET /api/properties` (search, filters, sort, paging) · `GET /api/properties/{categories,facets,top-rated,compare,saved/list,:id}` · `POST|DELETE /api/properties/:id/save` · `GET|POST /api/properties/:id/reviews`
- **Posting:** `POST /api/post-property` · `POST /api/uploads`
- **Enquiries:** `POST /api/enquiries`
- **Mobile API contract (v2):** `/api/v2/*`; see [MOBILE_API.md](MOBILE_API.md)

## Testing

```bash
cd backend  && npm test            # API, auth, security, uploads, rate limits, Firebase sign-in
cd frontend && npm test            # validation, compare logic, error mapping
cd frontend && npm run bundle:check   # builds the whole app bundle
```

Manual device checklist: [TEST-CASES.md](TEST-CASES.md).

## Documentation

| Document | Use it for |
|---|---|
| [docs/setup.md](docs/setup.md) | **Start here.** Local setup, production accounts, Render, EAS, Google Play, Sentry |
| [docs/security.md](docs/security.md) | Security measures in place and planned improvements |
| [MOBILE_API.md](MOBILE_API.md) | The v2 mobile API contract |
| [TEST-CASES.md](TEST-CASES.md) | Manual and automated test cases |
| [SETUP.md](SETUP.md) | Older setup guide: database checks and the one-off collection migration |
| [ERROR_FIX_LOG.md](ERROR_FIX_LOG.md), [SOLUTIONS.md](SOLUTIONS.md) | History of past setup problems and their fixes |
| [README_UI_UPDATE.md](README_UI_UPDATE.md) | Notes from the UI redesign |
