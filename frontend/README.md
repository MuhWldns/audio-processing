# AudioProcessing Frontend - Next.js App Router

Next.js 14+ frontend for the AudioProcessing platform with Roblox Script Store.

## Tech Stack

- **Framework**: Next.js 14+ (App Router)
- **Language**: TypeScript
- **Styling**: Tailwind CSS
- **Authentication**: Session-based (via Express backend)
- **API**: Express backend on `http://localhost:3001`

## Project Structure

```
frontend/
├── app/                          # Next.js App Router
│   ├── layout.tsx               # Root layout with AuthProvider and Header
│   ├── page.tsx                 # Homepage (store landing)
│   ├── globals.css              # Global styles with Tailwind
│   ├── login/
│   │   └── page.tsx             # Login page (Google/Discord OAuth)
│   ├── audio/
│   │   ├── page.tsx             # Audio landing page
│   │   ├── studio/
│   │   │   └── page.tsx         # Audio studio (protected)
│   │   └── history/
│   │       └── page.tsx         # Audio history (protected)
│   └── store/                   # Future: Roblox Script Store
├── components/
│   └── Header.tsx               # Shared header with auth state
├── lib/
│   └── auth-context.tsx         # Auth context provider
├── middleware.ts                # Route protection middleware
├── next.config.js               # Next.js configuration with API proxy
├── tailwind.config.js           # Tailwind CSS configuration
└── .env.local                   # Environment variables

```

## Environment Variables

Create `.env.local`:

```env
NEXT_PUBLIC_API_URL=http://localhost:3001
NEXT_PUBLIC_UPLOAD_URL=http://localhost:3001/upload
```

## Getting Started

### Install Dependencies

```bash
cd frontend
npm install
```

### Run Development Server

```bash
npm run dev
```

Frontend will run on `http://localhost:3000`

### Build for Production

```bash
npm run build
npm start
```

## Features

### Phase 1 (Current)

- ✅ Session-based authentication (Google, Discord OAuth)
- ✅ Audio processing studio with Web Audio API
- ✅ Audio upload history with re-download
- ✅ Protected routes with middleware
- ✅ Rupiah wallet display
- ✅ User profile dropdown

### Phase 2 (Planned)

- [ ] Roblox Script Store homepage
- [ ] Product listing and detail pages (SSR for SEO)
- [ ] Shopping cart and checkout
- [ ] License management dashboard
- [ ] Admin panel

## Routes

### Public Routes
- `/` - Homepage (store landing)
- `/login` - Login page
- `/audio` - Audio processing landing

### Protected Routes (require authentication)
- `/audio/studio` - Audio processing studio
- `/audio/history` - Upload history
- `/dashboard/*` - User dashboard (future)
- `/store/cart` - Shopping cart (future)
- `/store/checkout` - Checkout (future)

## API Integration

All API calls go through the Express backend at `http://localhost:3001`:

- `GET /auth/me` - Get current user session
- `POST /auth/logout` - Logout
- `GET /auth/google` - Google OAuth login
- `GET /auth/discord` - Discord OAuth login
- `GET /history` - Get audio upload history
- `GET /history/:id/download` - Download audio file
- `POST /upload` - Upload processed audio

## Authentication Flow

1. User clicks "Login with Google/Discord"
2. Redirects to backend OAuth route (`/auth/google` or `/auth/discord`)
3. Backend handles OAuth flow and creates session
4. Backend redirects back to frontend (`/audio/studio?login=success`)
5. Frontend calls `/auth/me` to get user data
6. AuthContext stores user state globally

## Middleware Protection

Protected routes check for `connect.sid` session cookie. If missing, redirects to `/login?redirect={original_path}`.

## Development Notes

- Audio processing happens client-side using Web Audio API
- Backend is source of truth for authentication and data
- Next.js API proxy rewrites `/api/*` to `http://localhost:3001/*`
- Session cookies are shared between frontend and backend (same domain in production)

## Backend Dependency

This frontend requires the Express backend to be running on `http://localhost:3001`.

Start backend first:
```bash
cd ../backend
npm run dev
```

Then start frontend:
```bash
cd frontend
npm run dev
```
