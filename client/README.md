# Tagalong — Group Travel Matcher (frontend)

React + Vite + TypeScript client for Problem 3. It talks only to the backend API
(`/api/v1`, spec v1.3). It never reads the data pack files, and nothing is hard-coded:
cities, home cities, interests, the date window, scores, reasons, prices and statuses all come from the API.

## Run

The client is an npm workspace of the repo. From the **repo root**:

```bash
npm install        # installs the server and the client
npm run db:up      # MongoDB in Docker
npm run dev        # backend on :4000 and this app on http://localhost:5173
```

Vite forwards `/api` and `/static` to the backend on `http://localhost:4000`.
To use another address: `VITE_BACKEND_URL=http://host:port npm run dev:client`.

`npm run build` (root) type-checks and builds the client to `client/dist/`; `npm run typecheck` only type-checks.

## Preview without the real backend (dev only)

Two in-memory fake backends with sample data (two Kyoto groups, two hotels) are kept for UI work:
`dev-mock/server.mjs` (used by `npm run mock -w client`) and an older copy in `mock/server.mjs`.
They listen on :4000, so stop the real backend first. The demo always uses the real backend.

## Structure

```
src/
  api/types.ts        schemas copied from the API spec §4
  api/client.ts       fetch wrapper: X-Traveller-Id header, error envelope → ApiError
  api/endpoints.ts    one function per operation, E01–E29
  api/hooks.ts        TanStack Query hooks, cache keys, polling, invalidation
  session/            no-password identity (localStorage + GET /me on load)
  pages/              Welcome, Home (role choice), Create, Search, Group, My trips, Profile
  pages/group/        Join requests, Hotels, Shortlist + votes + booking, Booking and split
  components/         layout, cards, modal, toasts, interest picker, city art
  lib/                ₹ and date formatting, error wording
```

## Feature map

| Feature | Where | API |
| --- | --- | --- |
| M1 sign-up, "Continue as", session restore | `WelcomePage`, `SessionContext` | E02–E05, E07 |
| M2 create a group post | `CreateGroupPage` | E03, E08 |
| M3 seeker search (pre-filled from profile) | `SearchPage` | E11, E12 |
| M4 matches with score and reasons, rule checklist | `SearchPage`, `MatchCardView`, `GroupPage` | E13, E14 |
| M5 request, approve or decline, withdraw, badge | `JoinRequestModal`, `RequestsPanel`, `MyTripsPage`, `TopBar` | E10, E15–E20 |
| M6 hotels with total and per-person price, save, vote, confirm popup, book, split | `HotelsPanel`, `ShortlistPanel`, `BookingPanel` | E21–E29 |
| G1 filter by shared interest and group make-up | `SearchPage` results | E13 |
| G2 member profile pages | `ProfilePage` | E06 |

## Design decisions

- **The server is the source of truth.** Every mutation writes the returned resource into the cache; the client never calculates prices, scores or rule results.
- **Errors** are handled by `error.code`, never by message text. Field errors show under the matching input.
- **Live updates:** the request badge, group page and booking poll every 15 s; the shortlist every 10 s, so votes from other members appear.
- **Dates** are formatted as calendar dates (UTC), so the viewer's time zone can never shift a day.
- **Search filters and page** live in the URL, so a refresh keeps the results.
- **Fonts** (Fraunces, Source Serif 4) are bundled, so the app works offline at the demo.

## City photos (optional)

Put photos in `public/cities/` named by city: `tokyo.jpg`, `kyoto.jpg`, `osaka.jpg`, `dubai.jpg`, `abu-dhabi.jpg`.
They appear on trip cards automatically (`CityBanner` tries `cities[].image` from the API first, then
`/cities/<city>.jpg`). Without them a plain colour block is shown. The data pack has no city photos.
Hotel photos come from the backend (`/static/hotels/...`).
