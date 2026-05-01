# AudioProcessing Project Documentation

## 1. Project Overview

This project is a web-based audio processing app for RBX Royale Community. The user can upload an audio file, preview it in the browser, adjust the sound with simple controls, export the processed result, and upload the output to the backend. The app is designed with a monetization system in mind, including:

- Google and Discord login
- Session-based authentication
- User profile information in the top-right area
- User history for processed audio
- Daily free usage quota
- Token-based billing after the free quota is exhausted
- Wallet and transaction tracking

The frontend is built with React, TypeScript, Vite, React Router, and Tailwind CSS.
The backend is built with Express, Passport, Prisma, and MySQL.

The project is split into two main concerns:

1. Frontend experience
   - Landing page
   - Login page
   - Protected studio page
   - User history page
   - Shared layout and auth-aware navigation

2. Backend services
   - OAuth login with Google and Discord
   - Session management
   - User/account persistence in MySQL
   - Upload handling
   - Audio history persistence
   - Daily free quota logic
   - Token-ready data structures

---

## 2. Product Goal

The application is meant to solve a simple problem:

- A user wants to take audio, process it, and use the result in a Roblox-related workflow.
- The app should make that process easy, trackable, and monetizable.
- New users get a small daily free allowance.
- After the free allowance, the app charges a fixed token cost per audio action.
- The user can log in, see their profile, see their balance, and revisit previous uploads.

The goal is not just audio editing. The goal is a complete service flow:

- acquisition through landing page
- authentication through OAuth
- usage through the studio
- persistence through history
- monetization through wallet and tokens

---

## 3. Current Feature Status

### Completed

- Branding and UI theme set to RBX Royale Community style
- Landing page copy simplified for end users
- Router split into landing page, login page, studio page, and history page
- Protected routes for studio and history
- Google and Discord OAuth backend scaffold
- Session-based auth through Express and Passport
- Prisma + MySQL schema for user, wallet, history, upload, and top-up data
- Free 3-audio-per-day quota model in backend schema
- Upload history recording in backend
- Download-again-from-history feature
- Avatar fallback for broken Google profile image URLs

### Still pending / future work

- Filter history by type
- Recent activity dropdown menu polish
- Payment/top-up flow
- Token reserve / settle / refund logic full implementation
- More complete user dashboard
- Better upload metadata tracking from the studio
- Token balance update UI refinements

---

## 4. High-Level Architecture

### Frontend

The frontend is a single-page application with route-based views.

Main frontend concerns:

- landing experience
- login experience
- protected audio studio
- history page
- auth-aware header
- upload and export UI

### Backend

The backend is an Express API responsible for:

- OAuth callback handling
- session persistence
- upload storage
- history persistence
- user retrieval through `/auth/me`
- recording usage data

### Database

MySQL stores the persistent data through Prisma models.

The important persisted objects are:

- `User`
- `OAuthAccount`
- `Session`
- `Wallet`
- `TokenTransaction`
- `UsageEvent`
- `ActivityLog`
- `UploadRecord`
- `TopUpOrder`

---

## 5. Frontend Structure

### Routing

The app uses React Router with a shared layout.

Main routes:

- `/` = landing page
- `/login` = login page
- `/studio` = protected studio page
- `/history` = protected history page

Any unknown route redirects back to `/`.

### Shared Layout

The shared layout contains:

- brand logo
- navigation links
- login/logout button
- user profile area
- token display
- page outlet content

The layout uses the RBX Royale Community visual theme and also handles the case where the user profile image fails to load.

### Landing Page

The landing page is for first-time visitors and explains the product in simple language.
It highlights:

- quick audio prep
- clear output options
- simple account upload

It also has a CTA that leads to the studio.

### Login Page

The login page offers two buttons:

- Continue with Google
- Continue with Discord

These buttons go directly to the backend OAuth start routes.
After successful login, the backend redirects the user back to the studio.

### Studio Page

The studio is the main workspace. It contains:

- file upload drop zone
- transport controls
- export format selector
- loop toggle
- playback and export status messages
- processing controls like gain, EQ, and reverb

The studio is protected, so the user must already be logged in.

### History Page

The history page lists previously processed audio items.
Each record can be downloaded again.
This page is also protected.

### Auth Context

The frontend uses a shared auth context to store:

- current user
- loading state
- refresh function
- logout function

The context loads the current session from `/auth/me` when the app starts.

---

## 6. Authentication Flow

### Login Flow

The auth flow is session-based OAuth.

1. User opens the login page.
2. User clicks Google or Discord.
3. Browser goes to backend route:
   - `/auth/google`
   - `/auth/discord`
4. Backend redirects to the provider.
5. User approves access.
6. Provider returns to the callback route:
   - `/auth/google/callback`
   - `/auth/discord/callback`
7. Backend reads the provider profile.
8. Backend finds or creates a `User` record.
9. Backend creates or updates `OAuthAccount`.
10. Backend creates a wallet if needed.
11. Backend stores session state in cookie-based session storage.
12. Backend redirects to `/studio?login=success`.
13. Frontend calls `/auth/me` to get the authenticated user data.

### Why this approach was chosen

- No password login is needed.
- OAuth identity stays on the backend.
- The frontend does not store secrets.
- Session cookies are safer than localStorage for login state.
- Prisma keeps the user identity synchronized with the OAuth account.

### Login Data Stored

For each login, the backend stores:

- user email
- display name
- avatar URL
- last login timestamp
- login provider
- activity log entry

---

## 7. User Profile and Header Information

When the user is logged in, the top-right header can show:

- avatar
- display name
- email or fallback name
- token balance
- logout button

If the avatar URL fails to load, the UI replaces it with a fallback avatar image generated from the user's name.

This makes the header more stable and prevents broken UI if Google or Discord provides an invalid or blocked image URL.

---

## 8. Audio Processing Flow

### Studio Behavior

The audio studio is browser-based and uses the Web Audio API.
The workflow is:

1. User uploads an audio file.
2. The app loads the file into the audio engine.
3. User previews the sound.
4. User adjusts:
   - gain
   - reverb
   - low EQ
   - mid EQ
   - high EQ
5. User exports the processed file.
6. The export is downloaded locally.
7. The processed file is sent to the backend.
8. Backend stores it and records it in history.

### Export Formats

The app supports:

- WAV
- MP3
- OGG

### Why the processing is local

The heavy playback and audio manipulation happen in the browser to keep the response fast and to avoid unnecessary server processing.
The backend is mainly for authentication, persistence, and upload tracking.

---

## 9. Daily Free Audio Quota

The monetization logic is designed around a free daily allowance.

### Rule

- New or logged-in user gets 3 free audio actions per day.
- After the 3 free actions are used, each additional audio action costs 1 token.
- The free allowance resets automatically every day.

### Data Used

The quota logic uses user fields in Prisma:

- `freeAudioDateKey`
- `freeAudioUsedToday`
- `freeAudioDailyLimit`
- `paidAudioTokenCost`

### Logic Flow

1. Backend checks the current date key.
2. If the date changed, the counter resets to zero.
3. Backend compares the used count to the daily limit.
4. The first 3 actions are free.
5. Any action after that is billed at 1 token.

### Why this works well

- No daily cron job is needed for the reset.
- The quota resets naturally when the user performs the next action on a new day.
- The logic stays in the backend, not the frontend.

---

## 10. Upload and History System

### What gets stored

When the user uploads a processed track, the backend records:

- file name
- file format
- source
- status
- upload time
- related activity log
- metadata about the processing
- file storage name on disk

### History Page

The history page is built to let the user:

- view previous uploads
- see when they were processed
- see the file format
- see the history status
- download the same file again

### Re-download Behavior

When the user clicks download again:

1. Frontend requests `/history/:id/download`.
2. Backend checks whether the record belongs to the logged-in user.
3. Backend checks whether the stored file still exists.
4. Backend streams the original file back to the browser.

### Why this is useful

- users can recover old exports without re-processing
- upload history becomes a practical library
- the service feels more like a product and less like a one-time tool

---

## 11. Token and Wallet System

The database is prepared for token monetization.

### Wallet

Each user has a wallet with:

- current balance
- reserved tokens
- lifetime top-up total
- lifetime spent total

### Token Transaction

The token ledger stores every balance-changing action:

- top up
- reserve
- settle
- refund
- adjustments

### How it will be used

- Before paid usage, tokens can be reserved.
- After a successful usage, tokens are settled.
- If a process fails, tokens can be refunded.

### Current status

The schema exists, but the full reserve/settle/refund flow is still a future task.

---

## 12. Activity Log and User History

The activity log is broader than upload history.
It is intended to store actions like:

- login
- logout
- top up
- token usage
- audio export
- audio upload
- failed actions
- refunds
- rollbacks

This log is useful for:

- user-facing history pages
- audit trail
- customer support
- billing transparency

### Intended future use

The history page can eventually be expanded to show:

- uploads
- logins
- token changes
- failed actions
- refunds
- top ups

---

## 13. Backend API Overview

### Auth Routes

- `GET /auth/google`
- `GET /auth/google/callback`
- `GET /auth/discord`
- `GET /auth/discord/callback`
- `POST /auth/logout`
- `GET /auth/me`

### Audio and History Routes

- `POST /upload`
- `GET /history`
- `GET /history/:id/download`

### Utility Routes

- `GET /health`
- `GET /db-health`

### How the backend uses sessions

The backend uses `express-session` and Passport.
The session is stored in a cookie and checked by the protected frontend routes through `/auth/me`.

---

## 14. Environment Variables

### Backend `.env`

Required variables include:

- `PORT`
- `DATABASE_URL`
- `SESSION_SECRET`
- `FRONTEND_URL`
- `CORS_ORIGIN`
- `UPLOAD_API_KEY`
- `UPLOAD_RATE_LIMIT`
- `UPLOAD_RATE_WINDOW_MIN`
- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `GOOGLE_CALLBACK_URL`
- `DISCORD_CLIENT_ID`
- `DISCORD_CLIENT_SECRET`
- `DISCORD_CALLBACK_URL`

### Frontend `.env`

Useful frontend variables include:

- `VITE_API_URL`
- `VITE_UPLOAD_URL`
- `VITE_UPLOAD_API_KEY`

---

## 15. Setup Summary

### Backend

1. Install dependencies.
2. Configure `.env`.
3. Run Prisma generate.
4. Run Prisma migration.
5. Start the Express server.

### Frontend

1. Install dependencies.
2. Start Vite dev server.
3. Open login or studio pages.

### OAuth Dashboard

Set redirect URIs in Google and Discord dashboards to:

- `http://localhost:3001/auth/google/callback`
- `http://localhost:3001/auth/discord/callback`

---

## 16. Important Implementation Notes

### Data consistency

The backend is the source of truth for:

- auth state
- history
- wallet balance
- free quota
- uploads

### UI consistency

The frontend only reflects what the backend says.
It does not calculate trust-sensitive data on its own.

### Why route protection matters

Protected routes prevent:

- unauthenticated studio access
- unauthenticated history access
- broken session assumptions

### Why history is tied to upload record

Upload records create a reliable link between:

- file data
- saved file on disk
- user identity
- download recovery
- audit log entry

---

## 17. Suggested Next Tasks

1. Add filtered history by type.
2. Add a compact user dropdown menu.
3. Add token top-up pages and flow.
4. Add proper reserve/settle/refund logic.
5. Add usage breakdown in the header.
6. Add upload metadata like duration and speed settings from the studio.
7. Add admin or support views for troubleshooting.

---

## 18. Token Charge Plan (Export + Download)

### Rule Update

- Upload is storage-only and does not consume tokens.
- Token usage happens on export and on downloading history.
- Free daily quota applies to export/download actions.
- Retries always consume tokens.
- Download failure is considered impossible because audio processing is client-side and backend only validates balance and settles usage.

### Planned Backend Changes

- Add a dedicated charge endpoint for export actions (example: `POST /export/charge`).
- Apply charge logic inside `GET /history/:id/download` before returning the file.
- Record token usage in the ledger as `SETTLE` and log activity as `AUDIO_EXPORT` or `TOKEN_USAGE`.
- Keep upload endpoint as storage + history only.

### Planned Frontend Changes

- Call the export charge endpoint when the user exports.
- Keep history download charge handled by backend (no client-side calculation).

---

## 19. Final Summary

This project is already more than a simple audio editor. It is evolving into a full product with:

- branded landing page
- OAuth login
- protected studio
- daily free usage quota
- token economy
- upload history
- download recovery
- session-based user identity
- Prisma-backed persistence

The long-term direction is a creator-focused audio service with a clear product flow:

visit -> login -> process audio -> export -> upload -> history -> billing
