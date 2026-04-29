# Feature Checklist

## Foundation

- [x] React + Vite frontend
- [x] Express backend
- [x] Prisma + MySQL schema
- [x] OAuth auth libraries installed
- [x] Session-based auth scaffolding

## Branding and UI

- [x] Use RBX Royale Community logo
- [x] Rounded logo treatment in header and hero
- [x] Theme aligned with brand colors
- [x] Simple user-facing copy on landing page
- [x] Router with landing page and studio page

## Authentication

- [x] Google login scaffolded in backend
- [x] Discord login scaffolded in backend
- [x] Session persistence after login
- [x] Logout flow
- [x] Auth-aware top-right user menu
- [x] `/auth/me` response available from backend
- [x] Frontend wired to show logged-in user state

## User Data

- [x] Store avatar, display name, email, provider
- [x] Show login info in the header
- [x] Show token balance in the user menu
- [x] Save login history

## Audio Usage

- [x] Audio preview and export in studio
- [x] Upload processed audio to backend
- [x] Daily free audio quota schema and logic planned
- [x] Free 3 audio per day for new users
- [x] Reset free quota every day
- [x] Charge 1 token per audio after free quota
- [x] Track usage history per audio action

## Token System

- [x] Wallet schema in Prisma
- [x] Token transaction schema in Prisma
- [ ] Reserve token before paid usage
- [ ] Settle token after successful usage
- [ ] Refund token on failed usage
- [ ] Top up flow
- [ ] Token balance UI

## History

- [x] Activity log schema in Prisma
- [x] Upload record schema in Prisma
- [x] Top-up order schema in Prisma
- [x] User history page
- [ ] Filter history by type
- [ ] Show recent activity in profile dropdown

## Next Builds

- [x] Protected routes for studio
- [x] Backend endpoint for usage quota checking
- [x] Backend endpoint for user history list
- [x] Frontend dashboard for profile and history
- [ ] Payment flow for top up

## Summary

- Completed: frontend landing/studio split, branding, Prisma MySQL schema, auth libraries, session auth scaffold, backend OAuth routes, `/auth/me`, daily free-audio quota model, login page, protected routes, history page, upload history/download endpoints.
- Remaining: filter history by type, recent activity dropdown, token settlement/refund flow, top up flow.
