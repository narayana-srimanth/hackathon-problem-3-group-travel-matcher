# Tagalong — Group Travel Matcher

**Travel solo, never alone.** Tagalong helps solo travellers find a group going to the same city on the same dates, then plan, chat and book a hotel together.

- **Hosts** post a trip: city, dates, budget, group size and a rough plan.
- **Seekers** search, see trips that really fit them (with the reasons why), and ask to join.
- **Hosts** approve or decline. Once in, the group picks a hotel together, sees the cost per person, chats, and books.
- **After the trip**, travellers rate each other, so the next group knows who they're travelling with.

Built with **MongoDB, Express, React and Node.js** (MERN).

---

## Contents

1. [Quick start](#1-quick-start)
2. [Try it: a 5-minute demo](#2-try-it-a-5-minute-demo)
3. [Features](#3-features)
4. [How matching works](#4-how-matching-works)
5. [Useful commands](#5-useful-commands)
6. [Project structure](#6-project-structure)
7. [Settings](#7-settings)
8. [Troubleshooting](#8-troubleshooting)
9. [More documentation](#9-more-documentation)
10. [About the hackathon data pack](#10-about-the-hackathon-data-pack)

---

## 1. Quick start

### What you need

| Tool | Version | Check with |
| --- | --- | --- |
| [Node.js](https://nodejs.org) | 20 or newer | `node -v` |
| MongoDB | 7 or newer | Either **Docker** (easiest) or MongoDB installed on your computer |

### Start the app (2 commands)

From the project folder (the one with this README):

```bash
npm install        # 1. install everything (server and website), once
npm run dev        # 2. start the server and the website
```

Then open **http://localhost:5173** in your browser.

> **MongoDB must be running first.**
> - With Docker: run `npm run db:up` once before `npm run dev` (and `npm run db:down` to stop it).
> - With MongoDB installed on your computer: just make sure the MongoDB service is running. Nothing else to do.

When the server starts it fills the database with the starting data (24 travellers, 12 trips, 5 cities, 49 hotels) automatically. This is safe to repeat: it never overwrites what you've added.

You should see this in the terminal:

```
[api] Seed (inserted/total): cities 5/5, … travellers 24/24, groups 12/12
[api] Group Travel Matcher API on http://localhost:4000/api/v1
[web] ➜  Local:   http://localhost:5173/
```

| Part | Address |
| --- | --- |
| Website | http://localhost:5173 |
| API (server) | http://localhost:4000/api/v1 |

---

## 2. Try it: a 5-minute demo

There are no passwords. You "sign in" by picking a traveller, and your choice is remembered after a page refresh.

**As a host (Sarah)**
1. Open http://localhost:5173 and choose **Continue as… Sarah Thomas**.
2. Go to **My trips** and open *Kyoto Spring Temples* (Kyoto, 10–15 Apr 2027). You'll see the city photo, the itinerary and the members.
3. Try **Create trip**: pick a city and the preview card shows that city's photo straight away.

**As a seeker (a new traveller)**
1. Sign out (top right) and **sign up** as a new traveller: female, from Mumbai, interests *Temples and shrines*, *Street food and markets*, *Adventure sports*, travels with *Women only*.
2. **Find groups**: Kyoto, 9–16 Apr 2027, budget ₹62,000.
3. You'll see *Kyoto Spring Temples* with a **match %** and the reasons it fits (5 nights together, 2 shared interests, budgets ₹2,000 apart…).
4. Click **Request to join** and add a short message.

**Back as the host**
1. Sign in as Sarah again. **My trips** shows a red badge for the new request.
2. Open the trip → **Join requests**: see the seeker's profile, rating and match details, then **Approve**.

**As the group**
1. **Hotels**: only hotels in the trip's city, with the total price and the **price per person**. Save the ones you like.
2. **Shortlist and votes**: everyone votes. **Booking and split**: confirm in the popup to book.
3. **Chat**: message each other to plan. New messages appear by themselves within a few seconds, and the tab shows an unread count.

**Ratings after the trip**

Ratings open on the trip's check-out date. All trips in the data are in April 2027, so to try ratings now, start the app with a pretend "today" (see [Settings](#7-settings)):

```bash
TODAY=2027-04-21 npm run dev              # macOS / Linux / Git Bash
$env:TODAY="2027-04-21"; npm run dev      # Windows PowerShell
```

Then open a finished trip → **Overview** → **Rate your co-travellers**. The rating shows on that person's profile.

---

## 3. Features

| Feature | What you can do |
| --- | --- |
| **Sign up and profiles** | Create a profile (name, gender, home city, interests, who you'd travel with). No password. You stay signed in after refresh. Anyone can open a member's profile to see their interests, home city, age, trips and reviews. |
| **Post a trip** | Choose 1 of 5 cities (Tokyo, Kyoto, Osaka, Dubai, Abu Dhabi), dates between 1 and 20 April 2027, a group size of 1–4, a budget and an itinerary. A live preview shows how seekers will see it. |
| **Search and matches** | Enter your trip details and see only the trips that pass **all 6 matching rules**, best first, each with a match % and the reasons. Filter by shared interest and by group make-up (all women, all men, mixed). If nothing matches, you get hints, such as different dates or another city. |
| **Join requests** | Ask to join with a message. The host approves or declines. You can withdraw. You can't be in two trips on the same nights. |
| **Group page** | A shared page for members. **Hotels**: search, filter and see the price per person. **Shortlist and votes**: everyone votes. **Booking and split**: confirm and see who pays what. |
| **Group chat** | Members message each other on the trip page. Only members can see it. |
| **Co-traveller ratings** | After the trip, members rate each other (1–5 stars plus an optional comment), once per person per trip. Ratings show on profiles, next to members, on search results and in join requests, so people can build trust. |
| **City photos** | Each city has a photo, used on trip cards, the create-trip preview and the group page header. |

---

## 4. How matching works

A trip shows up in a seeker's results only if **all 6 rules** pass:

| Rule | Passes when | Example |
| --- | --- | --- |
| **Same city** | Both are going to the same city | Kyoto and Kyoto ✅ · Kyoto and Osaka ❌ |
| **Dates overlap** | At least **2 nights** in common | 10–15 Apr and 9–16 Apr share 5 nights ✅ |
| **Budget** | The difference is at most **40%** of the lower budget | ₹60,000 and ₹84,000 ✅ · ₹60,000 and ₹85,000 ❌ |
| **Shared interests** | At least **2 interests** in common with the host | Temples + street food ✅ |
| **Gender preference** | Each person's preference accepts the other | Women-only host and women-only seeker ✅ |
| **Group size** | There's still a free spot | Wants 3, has 2 ✅ · has 3 ❌ |

Trips that pass are then ranked by a **match %** based on shared interests, nights together, how close the budgets are, and free spots.

---

## 5. Useful commands

Run these from the project folder.

| Command | What it does |
| --- | --- |
| `npm install` | Install everything (run once) |
| `npm run dev` | Start the server and the website (both reload when you edit code) |
| `npm run db:up` / `npm run db:down` | Start or stop MongoDB in Docker |
| `npm run reset` | **Wipe all your data** and go back to the starting data |
| `npm test` | Run the server tests (MongoDB must be running) |
| `npm run lint` | Check the server code style |
| `npm run typecheck` | Check the website code for type errors |
| `npm run build` | Build the website for production (into `client/dist/`) |
| `npm start` | Start only the server, without auto-reload |

---

## 6. Project structure

```
├── client/                React website (Vite + TypeScript)
│   └── src/
│       ├── pages/         One file per screen (Search, Create trip, Group page, Profile…)
│       │   └── group/     The group page tabs: Chat, Join requests, Hotels, Shortlist, Booking, Ratings
│       ├── components/    Shared pieces: trip cards, city photos, stars, pop-ups
│       └── api/           Talking to the server: one function per API call
│
├── server/                Express API
│   ├── src/
│   │   ├── routes/        URLs → controllers
│   │   ├── controllers/   Read the request, call a service, send the response
│   │   ├── services/      The business logic (matching, join requests, booking, chat, ratings)
│   │   ├── domain/        Pure rules and calculations (matching rules, pricing, dates)
│   │   ├── models/        MongoDB collections
│   │   └── validators/    Checks on what users send
│   ├── assets/cities/     City photos (with credits)
│   └── tests/             Automated tests
│
├── data/                  Starting data from the hackathon (read-only)
├── images/                Hotel photos from the hackathon (read-only)
└── docs/                  Planning notes
```

**How a request flows:** website → `/api/v1/...` → route → controller → service → MongoDB. The website never reads the data files directly; everything comes from the server.

---

## 7. Settings

All settings are optional. Set them as **environment variables** in the terminal before `npm run dev`. The server doesn't read a `.env` file; `server/.env.example` only lists the names and defaults.

| Setting | Default | What it's for |
| --- | --- | --- |
| `PORT` | `4000` | The server's port |
| `MONGO_URI` | `mongodb://localhost:27017/group-travel-matcher` | Which MongoDB database to use |
| `TODAY` | the real date | Pretend "today" is this date (`YYYY-MM-DD`). Useful for trying **ratings**, which open after a trip ends. |
| `VITE_BACKEND_URL` | `http://localhost:4000` | Where the website sends API calls (only if the server runs elsewhere) |

---

## 8. Troubleshooting

| Problem | Fix |
| --- | --- |
| `Database tests need MongoDB…` or the server stops with a connection error | MongoDB isn't running. Start it with `npm run db:up` (Docker) or start your local MongoDB service. |
| `EADDRINUSE: address already in use :::4000` | The app is already running in another terminal. Use that one, or stop it first (Ctrl+C). |
| Website opens on port **5174** instead of 5173 | Same reason: another copy of the website is already running on 5173. |
| "Can't reach the server" in the website | The server isn't running, or it crashed. Check the `[api]` lines in the terminal. |
| I want a clean start | `npm run reset` (this deletes everything you created) |
| Ratings say "Ratings open on 15 April 2027" | That's expected: trips are in April 2027. Use `TODAY=2027-04-21` (see [Settings](#7-settings)). |
| Hotel photos look the same in different cities | Expected: the data has 10 generic room photos shared by all hotels. Check the hotel names. |

---

## 9. More documentation

| File | What's inside |
| --- | --- |
| [`Group Travel Matcher — API Specification v1.md`](./Group%20Travel%20Matcher%20—%20API%20Specification%20v1.md) | Every API endpoint (E01–E34), with request and response examples and error codes |
| [`Group Travel Matcher — Backend Architecture (MERN).md`](./Group%20Travel%20Matcher%20—%20Backend%20Architecture%20(MERN).md) | How the backend is designed |
| [`client/README.md`](./client/README.md) | Website details and design decisions |
| [`problem-3-group-travel-matcher.md`](./problem-3-group-travel-matcher.md) | The original hackathon problem statement |
| [`DATA_DICTIONARY.md`](./DATA_DICTIONARY.md) | What every field in the data files means |

---

## 10. About the hackathon data pack

This project started from the *Problem 3: Group Travel Matcher* hackathon pack.

- **`data/`** holds the starting data: travellers, trips, interests, cities, hotels, rooms and room availability. It is **read-only**: the app copies it into MongoDB on start-up and keeps all new data (sign-ups, trips, requests, bookings, chat, ratings) in its own database.
- All data is made up, except the photos. Prices are in INR, and dates and times are local to each city.
- **Photos** are real, freely licensed images from Wikimedia Commons. Credits: hotel photos in [`images/ATTRIBUTIONS.md`](./images/ATTRIBUTIONS.md), city photos in [`server/assets/cities/ATTRIBUTIONS.md`](./server/assets/cities/ATTRIBUTIONS.md).
- **Hackathon rules followed:** the app doesn't call any AI model; the website gets all data from our backend; the data files are unchanged; and the app starts with 2 commands.
