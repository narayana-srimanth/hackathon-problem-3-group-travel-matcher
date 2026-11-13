# Group Travel Matcher — Backend Architecture (MERN)

Nov 13, 2026 · @narp

## 1. Overview and architecture

The backend is a layered Express + MongoDB service. All matching, ranking, approval and cost logic sits in pure domain modules that the HTTP layer calls. Both the catalog (imported once from the JSON files) and everything users create live in MongoDB. Booking a hotel reduces the rooms left in the database copy; the files themselves are never modified.

&#91;embedded content: backend architecture · 4 layers, 2 stores\]

Calls only go down. The domain layer has no I/O, so every rule can be tested and changed in isolation. Services are the only layer that touches MongoDB or the catalog.

**Design goals, each traced to a requirement**

| Goal | Why (source) | How |
| --- | --- | --- |
| Correct matches on any new input | Rules in §5; judging gives 25% to correctness; "a match that breaks a rule is wrong" | One pure function `evaluateMatch()`, thresholds as named constants, golden unit tests |
| Logic stays in the backend | Tech rule "Backend holds logic" | The frontend sends inputs and renders results. Prices, eligibility and per-member costs are always computed on the server. |
| State survives refresh and restart | Tech rule "State persistence" | MongoDB, plus an idempotent seed that never overwrites existing data (including reduced `roomsLeft`) |
| Catalog files are never modified | README rule 3 | The JSON files are imported once into Mongo catalog collections. The app changes only `roomsLeft` in its own copy, never the files. |
| Rooms really get used up | Your decision: booking reduces availability | Atomic conditional `$inc` per night on `availability`, rolled back if any night fails (§6) |
| Easy to change live in the demo | 20% of judging is on individual understanding and a live code change | Rules, weights and limits live in `domain/constants.js`; each rule is one small function |
| Starts with 1–2 commands | Tech rule "Quick start" | `docker compose up -d mongo` then `npm run dev` (runs server and client together) |

**Stack**

| Layer | Choice | Reason |
| --- | --- | --- |
| Runtime | Node.js 20 LTS, Express 4 | MERN baseline |
| Database | MongoDB 7, Mongoose 8 | Schema validation, indexes, atomic conditional updates |
| Validation | zod | One schema per request body; the same schemas can be shared with the client |
| Frontend | React 18 + Vite, React Router, TanStack Query | Server state is cached and refetched after mutations |
| Tests | Jest, supertest, mongodb-memory-server | Domain unit tests plus API integration tests without a real Mongo |
| Dev tooling | concurrently, nodemon, ESLint + Prettier | One `npm run dev` |

**Layers (top calls down, never up)**

1. **Routes** (`routes/*.js`): URL to controller, plus middleware (`identify`, `validate(schema)`).
2. **Controllers**: turn HTTP into service calls and map results to response DTOs. No business rules.
3. **Application services** (`services/*.js`): use cases such as `createGroup`, `requestToJoin`, `approveRequest` and `bookOption`. They handle authorisation, orchestration and atomic DB updates.
4. **Domain** (`domain/*.js`): pure functions with no I/O: `dates`, `matching`, `ranking`, `pricing`. 100% unit-tested.
5. **Data access**: Mongoose models for user data (`Traveller`, `Group`, `Search`, `JoinRequest`, `SavedOption`, `Booking`, `Counter`) and for the imported catalog (`City`, `DepartureCity`, `Interest`, `Hotel`, `Room`, `Availability`).

**Folder structure**

```text
group-travel-matcher/
├─ docker-compose.yml          # mongo:7 on 27017 with a named volume
├─ package.json                # "dev": concurrently server + client
├─ data/                       # the hackathon pack, untouched (read-only)
├─ server/
│  └─ src/
│     ├─ server.js             # boot: connect DB → seed (catalog + travellers + groups) → listen
│     ├─ app.js                # express app, routes, error handler
│     ├─ config/env.js         # PORT, MONGO_URI, DATA_DIR
│     ├─ db/connect.js  db/seed.js  db/reset.js
│     ├─ models/               # user data: Traveller, Group, Search, JoinRequest, SavedOption, Booking, Counter
│     │                        # catalog:   City, DepartureCity, Interest, Hotel, Room, Availability
│     ├─ domain/               # constants, dates, matching, ranking, pricing
│     ├─ services/             # traveller, group, search, joinRequest, hotel, booking, meta
│     ├─ controllers/  routes/  validators/
│     └─ middleware/           # identify, validate, errorHandler
│  └─ tests/                   # domain/*.test.js, api/*.test.js
└─ client/                     # React + Vite
```

**Request lifecycle (example: approving a join request)**

1. `POST /api/v1/join-requests/JR-0007/approve` arrives with header `X-Traveller-Id: T-001`.
2. `identify` loads the actor from Mongo (401 if missing or unknown).
3. The controller calls `joinRequestService.approve(actor, 'JR-0007')`.
4. The service checks that the actor owns the group (403), moves the request PENDING → APPROVED with a conditional update, then adds the member with one atomic update that re-checks capacity (§6).
5. The controller returns `{ request, group }`. The error handler maps any `AppError` to the standard error envelope (§5).

**Identity.** M1 needs no passwords. On sign-up the client stores `travellerId` in `localStorage` and sends it as `X-Traveller-Id` on every call. The backend still enforces who can do what: only the owner approves, and only members see the group page. Seeded travellers can be picked from a "Continue as…" list, so the demo personas (Sarah T-001, and so on) work.

## 2. Data model

MongoDB holds 13 collections: 7 for data users create (2.1–2.7) and 6 for the catalog imported from the data pack (2.8). All of them key on the pack's stable text IDs (`T-001`, `G-01`, `HTL-KYO-001`), and new records continue the same format. Of the catalog, only `availability.roomsLeft` ever changes, when a group books.

**Conventions**

- Every business key is a string field with a unique index (`travellerId`, `groupId`, …). Mongo's `_id` is never exposed. That keeps IDs identical between the data files, the API and the UI.
- Dates are stored as `YYYY-MM-DD` **strings** (the destination's local date, per the data dictionary). They are never JS `Date` objects, so a stay can't shift by a day in IST or UTC. All date arithmetic goes through `domain/dates.js`.
- Money is whole INR stored as integers (`budgetInr`, `totalInr`). Never floats, except the per-member costs (perMemberInr), which are rounded to 2 decimals for display (§4.6).
- `timestamps: true` on every schema (`createdAt`, `updatedAt`). `strict: 'throw'` rejects unknown fields.
- New IDs come from a `counters` collection via `findOneAndUpdate({ _id: 'group' }, { $inc: { seq: 1 } }, { upsert: true, new: true })`. Counters start at 1000, so new IDs (`G-1001`, `T-1001`) can never collide with seed IDs.

### 2.1 travellers (M1)

| Field | Type | Rules | Used by |
| --- | --- | --- | --- |
| `travellerId` | string | unique; `T-###` seeded, `T-1001+` new | every reference |
| `name` | string | 2–60 chars, trimmed | display (owner name in M4) |
| `age` | int | optional on sign-up, 18–99 | G2 profile |
| `gender` | enum | `FEMALE` \| `MALE` | rule R5 |
| `homeCity` | string | one of `departureCities.city` | display, M3 default |
| `homeAirport` | string | derived from `homeCity` (BLR, DEL, BOM, MAA) | display |
| `interests` | string\[\] | 1–16 items, each an ID in `interests`, de-duplicated | R4 (as owner), M3 default |
| `genderPreference` | enum | `ANY` \| `SAME_GENDER` | R5 |

Indexes: `{ travellerId: 1 }` unique. A profile has no dates, budget or group size: those are per trip (data dictionary §3).

### 2.2 groups (M2)

| Field | Type | Rules | Used by |
| --- | --- | --- | --- |
| `groupId` | string | unique; `G-##` seeded, `G-1001+` new | every reference |
| `name` | string | 3–80 chars | M4 card |
| `ownerId` | string | → travellers; set from the actor, never from the body | R4, R5, approvals |
| `memberIds` | string\[\] | **owner included**, unique, length 1..`maxSize` | R6, group page, cost split |
| `city` | string | one of the 5 cities in `cities` | R1, hotel search |
| `checkIn`, `checkOut` | string | ISO date; `2027-04-01 ≤ checkIn < checkOut ≤ 2027-04-20` | R2, hotel nights |
| `maxSize` | int | 1–4, total people **including owner**, ≥ current members | R6 |
| `budgetInr` | int | 1,000–10,000,000, approx. per person | R3 |
| `itinerary` | string | 0–2,000 chars | display |
| `status` | enum | `OPEN` \| `FULL` \| `BOOKED` | search filter, state machine (§6) |

Indexes: `{ groupId: 1 }` unique; `{ city: 1, status: 1, checkIn: 1 }` for search; `{ memberIds: 1 }` for "my groups".

Invariant: `status = FULL` exactly when `memberIds.length === maxSize` (and the group isn't booked). Both are written in the same atomic update.

### 2.3 searches (M3)

Each seeker search is stored as a snapshot. The 6 rules use the **search's** interests, budget and dates, not the profile's (data dictionary FAQ). A join request therefore points at the search it came from.

| Field | Type | Rules |
| --- | --- | --- |
| `searchId` | string | `S-1001+` |
| `travellerId` | string | → travellers (the actor) |
| `homeCity` | string | departure city |
| `city` | string | one of the 5 cities |
| `checkIn`, `checkOut` | string | same window and ordering as groups |
| `interests` | string\[\] | 1–16 valid IDs; the client pre-fills them from the profile |
| `budgetInr` | int | > 0 |
| `gender` | enum | **copied from the profile** at search time (the seeker doesn't type it) |
| `genderPreference` | enum | from the form; defaults to the profile |

Indexes: `{ searchId: 1 }` unique; `{ travellerId: 1, createdAt: -1 }`.

### 2.4 joinRequests (M5)

| Field | Type | Rules |
| --- | --- | --- |
| `requestId` | string | `JR-1001+` |
| `groupId` | string | → groups |
| `seekerId` | string | → travellers |
| `searchId` | string | → searches; the evidence that the seeker matched |
| `status` | enum | `PENDING` \| `APPROVED` \| `REJECTED` \| `WITHDRAWN` \| `CLOSED` (group filled or booked) |
| `matchSnapshot` | object | `{ sharedNights, sharedInterests[], budgetDiffInr, score }` at request time, shown to the owner |
| `message` | string | optional, ≤ 500 chars |
| `decidedBy`, `decidedAt` | string, Date | set on approve, reject or close |

Indexes: `{ requestId: 1 }` unique; `{ groupId: 1, status: 1 }` (owner inbox and badge); `{ seekerId: 1, createdAt: -1 }`; and a **partial unique index** `{ groupId: 1, seekerId: 1 }` where `status: 'PENDING'`. The database itself blocks duplicate pending requests, even from a double-click.

### 2.5 savedOptions (M6: save and compare)

| Field | Type | Rules |
| --- | --- | --- |
| `optionId` | string | `OPT-1001+` |
| `groupId` | string | → groups |
| `hotelId`, `roomId` | string | must exist in the catalog; the room must belong to the hotel |
| `savedBy` | string | member who saved it |
| `votes` | string\[\] | member IDs who like it (group alignment) |
| `snapshot` | object | `{ memberCount, roomsNeeded, nights, pricePerNightInr, totalInr, perMemberInr }` at save time |

Indexes: unique `{ groupId: 1, roomId: 1 }`, so the same option can't be saved twice. On every read the price is **recomputed live**. `stale: true` is returned when the member count changed after saving.

### 2.6 bookings (M6: finalise)

| Field | Type | Rules |
| --- | --- | --- |
| `bookingId` | string | `BK-2027-000001` (generated) |
| `groupId` | string | **unique**: one booking per group |
| `optionId`, `hotelId`, `roomId` | string | what was booked |
| `roomsBooked`, `nights` | int, string\[\] | e.g. 1, \[`2027-04-10` … `2027-04-14`\]; these exact nights had `roomsLeft` reduced |
| `memberIds` | string\[\] | snapshot at booking time |
| `totalInr` | int | price per night × rooms × nights |
| `perMemberInr` | number | `totalInr ÷ members`, rounded to 2 decimals (e.g. 15866.67) |
| `bookedBy`, `status` | string, enum | `CONFIRMED` (mock; no real payment) |

### 2.7 counters

`{ _id: 'traveller' | 'group' | 'search' | 'joinRequest' | 'option' | 'booking', seq: int }`. Generates readable sequential IDs.

**Why reference by ID instead of embedding.** Requests, options and bookings have their own lifecycles and are queried on their own (owner inbox, badge counts). Embedding them in `groups` would make the document grow without limit and make atomic capacity checks harder. Owner profiles are joined in one `$in` query per search (at most around 12–50 groups per city), so there's no N+1 problem.

### 2.8 Catalog collections (imported from the data pack)

These are a copy of the JSON files, imported at the first boot (§3) with field names in camelCase. The app only reads them, except `availability.roomsLeft`, which a booking reduces.

| Collection | Fields | Indexes | Source file |
| --- | --- | --- | --- |
| `cities` | `name`, `country`, `countryCode`, `timezone` | `{ name: 1 }` unique | `destinations.json` → `countries[].cities[]` |
| `departureCities` | `city`, `airport` | `{ city: 1 }` unique | `destinations.json` → `departure_cities` |
| `interests` | `interest`, `label`, `category` | `{ interest: 1 }` unique | `interests.json` |
| `hotels` | `hotelId`, `name`, `city`, `area`, `rating`, `stars`, `image`, `checkInFrom`, `checkOutUntil`, `familyFriendly`, `lat`, `lng` | `{ hotelId: 1 }` unique, `{ city: 1 }` | `hotels.json` |
| `rooms` | `roomId`, `hotelId`, `roomType`, `name`, `maxAdults`, `pricePerNightInr`, `refundable` | `{ roomId: 1 }` unique, `{ hotelId: 1 }` | `rooms.json` (`price_per_night.amount` → `pricePerNightInr`) |
| `availability` | `roomId`, `date`, `roomsLeft`, `initialRoomsLeft` | `{ roomId: 1, date: 1 }` **unique** | `availability.json` |

`initialRoomsLeft` keeps the file's original value, so `npm run reset` (or a sanity check) can always compare against or restore the starting state. The unique `{ roomId, date }` index makes the per-night booking update a single index lookup and stops a re-import from creating duplicates.

## 3. Catalog import and seeding

At boot the server imports the catalog files (cities, departure cities, interests, 49 hotels, 125 rooms, 2,500 availability rows), the 24 travellers and the 12 groups into MongoDB. Every write is **insert-only**: a restart never overwrites approvals, new users or the `roomsLeft` a booking reduced.

**Boot order (`server.js`)**

1. `connectDB(MONGO_URI)` fails fast with a clear message if Mongo is down.
2. `validateDataPack(DATA_DIR)` reads the JSON files and checks the references between them (below). If anything is broken, the server exits with the reason.
3. `seed()` runs a `bulkWrite` of `updateOne({ key }, { $setOnInsert: doc }, { upsert: true })` for each collection, in the order cities → departureCities → interests → hotels → rooms → availability → travellers → groups.
4. `syncIndexes()` on every model, then `app.listen(PORT)`.

The first boot inserts about 2,700 documents in well under a second. Later boots find every key already present and change nothing.

**Why insert-only (`$setOnInsert`) matters**

| Scenario | Plain "replace" seed | Insert-only seed |
| --- | --- | --- |
| Priya was approved into G-01, then the backend restarts | G-01 goes back to 1 member: **state lost** | G-01 keeps 2 members |
| A booking reduced Gion Corner Twin on 11 Apr from 2 to 1, then the backend restarts | Back to 2: **the room can be sold twice** | Stays at 1 |
| You want a clean demo slot | – | Run `npm run reset` (below) |

**Field mapping (snake\_case → camelCase)**

- Travellers: `traveller_id→travellerId`, `home_city→homeCity`, `home_airport→homeAirport`, `gender_preference→genderPreference`.
- Groups: `group_id→groupId`, `owner_id→ownerId`, `member_ids→memberIds`, `check_in→checkIn`, `check_out→checkOut`, `max_size→maxSize`, `budget_inr→budgetInr`, plus a derived `status` (`FULL` when `member_ids.length === max_size`; G-07 seeds as FULL).
- Hotels: `hotel_id→hotelId`, `check_in_from→checkInFrom`, `check_out_until→checkOutUntil`, `family_friendly→familyFriendly`.
- Rooms: `room_id→roomId`, `hotel_id→hotelId`, `room_type→roomType`, `max_adults→maxAdults`, `price_per_night.amount→pricePerNightInr`.
- Availability: `room_id→roomId`, `rooms_left→roomsLeft` and also `→initialRoomsLeft`.

**Data-pack validation (step 2).** Check that every `rooms.hotel_id` exists, every `availability.room_id` exists, every group's `owner_id` and `member_ids` are travellers, every group city is one of the 5 cities, and every traveller's interest exists in `interests.json`. This catches a wrong `DATA_DIR` on the demo laptop immediately, instead of as empty search results.

**`npm run reset` (demo prep).** Drops all 13 collections and re-runs the seed. The result is exactly the data pack: the 12 groups with their original members, the original `roomsLeft`, and no user sign-ups ("sign-up forms empty", §9 of the brief). Run it before your demo slot, because rehearsal bookings will have reduced availability.

## 4. Domain logic

Four pure modules: `dates`, `matching`, `ranking`, `pricing`. None of them touch the DB or HTTP. Services load the data from Mongo and pass it in as plain objects. That makes the domain deterministic, fast to unit-test, and the obvious place for a live code change.

### 4.1 constants.js (the live-change surface)

```js
export const RULES = {
  MIN_SHARED_NIGHTS: 2,          // R2
  BUDGET_TOLERANCE: 0.4,         // R3: 40% of the lower budget, inclusive
  MIN_SHARED_INTERESTS: 2,       // R4: compared with the OWNER's interests
};
export const DATA_WINDOW = { from: '2027-04-01', to: '2027-04-20' };
export const GROUP_SIZE = { min: 1, max: 4 };            // M2: total incl. owner
export const RANK_WEIGHTS = { interests: 0.35, dates: 0.30, budget: 0.25, space: 0.10 };
export const PAGE = { default: 20, max: 50 };
```

### 4.2 dates.js

Dates become integer day numbers in UTC, so no timezone can shift them. A stay `[checkIn, checkOut)` has the nights `checkIn … checkOut-1`.

```js
const DAY = 86_400_000;
export const toDay = (iso) => { const [y, m, d] = iso.split('-').map(Number); return Date.UTC(y, m - 1, d) / DAY; };
export const fromDay = (n) => new Date(n * DAY).toISOString().slice(0, 10);
export const nightCount = (a) => toDay(a.checkOut) - toDay(a.checkIn);
export const nightsOf = (a) => Array.from({ length: nightCount(a) }, (_, i) => fromDay(toDay(a.checkIn) + i));
export const sharedNights = (a, b) =>
  Math.max(0, Math.min(toDay(a.checkOut), toDay(b.checkOut)) - Math.max(toDay(a.checkIn), toDay(b.checkIn)));
export const isValidIsoDate = (s) => /^\d{4}-\d{2}-\d{2}$/.test(s) && fromDay(toDay(s)) === s; // rejects 2027-04-31
```

Checks: Sarah 10→15 and Priya 9→16 share `min(15,16) − max(10,9)` = 5 nights. 10→15 and 14→18 share 1. Back-to-back stays (10→14 and 14→18) share 0.

### 4.3 matching.js: evaluateMatch(search, group, owner)

The function runs **all** rules, without stopping at the first failure. Each check returns its evidence, so the same function powers the result list (M4), the "why it matched" text on each card (UX, 15%) and the server-side re-check when someone requests to join (M5).

```js
const allows = (pref, self, other) => pref === 'ANY' || self === other;

export function evaluateMatch(search, group, owner) {
  const nights = sharedNights(search, group);
  const lo = Math.min(search.budgetInr, group.budgetInr);
  const diff = Math.abs(search.budgetInr - group.budgetInr);
  const shared = search.interests.filter((i) => owner.interests.includes(i));
  const freeAfterJoin = group.maxSize - group.memberIds.length - 1;
  const checks = [
    { rule: 'SAME_CITY', passed: search.city === group.city },
    { rule: 'DATES_OVERLAP', passed: nights >= RULES.MIN_SHARED_NIGHTS, sharedNights: nights },
    // integer form of diff <= 0.4 * lo, so 84000 vs 60000 is exactly on the boundary and passes
    { rule: 'BUDGET', passed: diff * 10 <= RULES.BUDGET_TOLERANCE * 10 * lo, diffInr: diff, limitInr: Math.floor(RULES.BUDGET_TOLERANCE * lo) },
    { rule: 'SHARED_INTERESTS', passed: shared.length >= RULES.MIN_SHARED_INTERESTS, shared },
    { rule: 'GENDER', passed: allows(search.genderPreference, search.gender, owner.gender)
                          && allows(owner.genderPreference, owner.gender, search.gender) },
    { rule: 'GROUP_SIZE', passed: freeAfterJoin >= 0, freeAfterJoin },
  ];
  return { eligible: checks.every((c) => c.passed), checks, failed: checks.filter((c) => !c.passed).map((c) => c.rule) };
}
```

The service applies these **pre-filters** before the rules. They are not among the 6 rules, so the UI labels them separately:

- `group.status === 'OPEN'`. A BOOKED group is closed. A FULL group already fails R6.
- The seeker isn't the owner and isn't already a member (you can't match your own group).
- The search's city and dates are inside the data window. Otherwise return 422 `OUT_OF_DATA_RANGE` with a clear message (brief FAQ).

**Query plan:** `Group.find({ city: search.city, status: 'OPEN' })` (index-backed), then load the owners with one `Traveller.find({ travellerId: { $in: ownerIds } })`, then `evaluateMatch` for each group in memory, then rank. Even at 10× the seed data this is under 1 ms of CPU.

Expected results for Priya's search (golden test, §7):

| Group | Eligible | Failing rule | Evidence |
| --- | --- | --- | --- |
| G-01 Kyoto Spring Temples | yes | – | 5 nights, ₹2,000 gap, Temples + Street food, F/F, 1/3 |
| G-08 Kyoto Night Food Trail | yes | – | 4 nights, ₹7,000 gap, Street food + Temples, F/F, 1/4 |
| G-02 Kyoto Late Bloom | no | DATES\_OVERLAP | 1 shared night |
| G-03 Osaka Food and Temples | no | SAME\_CITY | Osaka |
| G-04 Kyoto Ryokan Retreat | no | BUDGET | ₹25,000 gap > ₹24,800 limit |
| G-05 Kyoto Trails and Shrines | no | SHARED\_INTERESTS | only Temples |
| G-06 Kyoto Camera Walk | no | GENDER | male owner; Priya wants SAME\_GENDER |
| G-07 Kyoto Market Mornings | no | GROUP\_SIZE | 3/3 (also not OPEN) |

### 4.4 ranking.js

Eligible groups are scored 0–100. Each component is normalised to \[0, 1\]:

| Component | Formula | Weight | Meaning |
| --- | --- | --- | --- |
| interests | `\|shared\| / \|search ∪ owner\|` (Jaccard) | 0.35 | how alike the two people are |
| dates | `sharedNights / max(seekerNights, groupNights)` | 0.30 | how much of both trips lines up |
| budget | `1 − diff / (0.4 × lower)` | 0.25 | 1 = same budget, 0 = right at the 40% edge |
| space | `freeAfterJoin / (maxSize − 1)` | 0.10 | room left for more friends |

`score = round(100 × Σ weight × component)`. Ties are broken deterministically: score ↓, shared-interest count ↓, shared nights ↓, earliest `checkIn`, then `groupId` ↑. The same input always produces the same order, which you can explain at the demo.

For Priya: G-01 gets interests 2/5 = 0.40, dates 5/7 ≈ 0.71, budget 1 − 2000/24000 ≈ 0.92, space 1/2 = 0.5, so the score is about 63. G-08 gets 2/4 = 0.50, 4/7 ≈ 0.57, 1 − 7000/22000 ≈ 0.68, 2/3 ≈ 0.67, so about 58. G-01 ranks first.

### 4.5 pricing.js: hotel options for a group (M6)

Inputs are the group (`city`, `checkIn`, `checkOut`) and the party size `m` (default: the current member count; `planFor=MAX` uses `maxSize`). Each option uses **one room type** for the whole group. Mixing room types is standout X4.

```js
// services/hotelService.js: 3 indexed queries load exactly what the pure function needs
const nights = nightsOf(group);
const hotels = await Hotel.find({ city: group.city }).lean();                       // Kyoto: 12
const rooms  = await Room.find({ hotelId: { $in: hotels.map((h) => h.hotelId) } }).lean();
const rows   = await Availability.find({ roomId: { $in: rooms.map((r) => r.roomId) }, date: { $in: nights } }).lean();
const availability = new Map(rows.map((a) => [`${a.roomId}|${a.date}`, a.roomsLeft]));  // current values, after bookings

// domain/pricing.js: pure
export const round2 = (x) => Math.round(x * 100) / 100;
export function priceOption(room, stay, m, availability) {
  const roomsNeeded = Math.ceil(m / room.maxAdults);
  const nights = nightsOf(stay);
  const left = nights.map((d) => availability.get(`${room.roomId}|${d}`) ?? 0); // a missing row counts as sold out
  const available = left.every((n) => n >= roomsNeeded);
  const totalInr = room.pricePerNightInr * roomsNeeded * nights.length;
  return { roomId: room.roomId, roomsNeeded, nights: nights.length, available, minRoomsLeft: Math.min(...left),
           pricePerNightInr: room.pricePerNightInr, totalInr, perMemberInr: round2(totalInr / m) };
}
```

The hotel search returns each hotel in the group's city with its **available** options, sorted by `perMemberInr` ascending by default (or `rating`/`stars` descending). Each option also shows `budgetSharePct = perMemberInr / group.budgetInr` (the hotel's share of each person's trip budget).

Worked check (data dictionary): G-01 with 2 members in RM-KYO-001-A (TWIN, max 2, ₹4,760). That's 1 room. The nights 10–14 have 6, 2, 4, 3, 3 rooms left, so it's available. Total 4,760 × 1 × 5 = **₹23,800**, which is **₹11,900** per member. With 3 members, TWIN needs 2 rooms: ₹47,600, ₹15,866.67 each.

### 4.6 Per-member cost (2 decimals)

`perMemberInr = round2(totalInr / members)`. It is computed on the server and stored as a number with 2 decimals; `totalInr` stays an integer and is the authoritative amount.

| Members | Total | Per member | Shown as |
| --- | --- | --- | --- |
| 2 | 23,800 | 11900 | ₹11,900.00 |
| 3 | 47,600 | 15866.67 | ₹15,866.67 |
| 4 | 47,600 | 11900 | ₹11,900.00 |

The client formats it with `new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', minimumFractionDigits: 2 })`, so the grouping is Indian (1,23,456.78). Known limitation to mention in the README: 3 × 15,866.67 = 47,600.01. That rounding difference of up to ₹0.01 per member is display-only, and the booking total stays ₹47,600.

## 5. API contract (Must-have scope)

REST over JSON at `/api/v1`. The map below lists 24 route groups (about 28 method + path pairs). Every mutation returns the updated resource, so the client never re-derives server state.

### 5.1 Conventions

- **Identity:** header `X-Traveller-Id: T-001` on every endpoint except `GET /meta/*`, `POST /travellers` and `GET /travellers`. Missing or unknown ID: `401 UNAUTHENTICATED`.
- **Field names:** camelCase in the API. Snake\_case appears only inside the catalog loader.
- **Dates** are `YYYY-MM-DD`; **money** is integer INR with an `Inr` suffix.
- **Lists** take `?page=1&limit=20` (max 50) and return `{ items, page, limit, total }`.
- **Validation** uses zod: unknown body fields are rejected, strings trimmed, interest arrays de-duplicated.
- **Errors** use one envelope:

```json
{ "error": { "code": "VALIDATION_ERROR", "message": "checkOut must be after checkIn",
             "details": [ { "field": "checkOut", "issue": "must be after checkIn" } ] } }
```

| HTTP | code | When |
| --- | --- | --- |
| 400 | `VALIDATION_ERROR` | wrong type, missing field, bad enum, impossible date |
| 401 | `UNAUTHENTICATED` | no or unknown `X-Traveller-Id` |
| 403 | `FORBIDDEN` | not the owner (approve or reject), not a member (group page, hotels, booking) |
| 404 | `NOT_FOUND` | unknown group, request, search, option or room |
| 409 | `DUPLICATE_REQUEST` \| `ALREADY_MEMBER` \| `OWN_GROUP` \| `GROUP_FULL` \| `GROUP_CLOSED` \| `ALREADY_BOOKED` \| `REQUEST_NOT_PENDING` \| `ALREADY_SAVED` | the state forbids the action |
| 422 | `OUT_OF_DATA_RANGE` | city not one of the 5, or dates outside 1–20 Apr 2027 (a clear message, per the brief) |
| 422 | `NOT_ELIGIBLE` | join request fails a matching rule; `details` lists the failed rules |
| 422 | `ROOMS_UNAVAILABLE` | the option is no longer free on every night |
| 500 | `INTERNAL` | anything else (logged with a request ID) |

### 5.2 Endpoint map

| # | Method & path | Who | Feature |
| --- | --- | --- | --- |
| 1 | `GET /health` | anyone | ops |
| 2 | `GET /meta/interests` | anyone | M1, M3 |
| 3 | `GET /meta/destinations` | anyone | M2, M3 |
| 4 | `POST /travellers` | anyone | M1 |
| 5 | `GET /travellers` | anyone | M1 "Continue as…" |
| 6 | `GET /travellers/:travellerId` | signed in | M1 (and G2 later) |
| 7 | `GET /me` | signed in | M1 session restore |
| 8 | `POST /groups` | signed in | M2 |
| 9 | `GET /groups/:groupId` | signed in | M4 detail, M6 |
| 10 | `GET /me/groups` | signed in | dashboard + badge (M5) |
| 11 | `POST /searches` | signed in | M3 + M4 |
| 12 | `GET /searches/:searchId/matches` | search owner | M4 (re-run live, paginate) |
| 13 | `GET /searches/:searchId/groups/:groupId/evaluation` | search owner | M4 "why it matched / why not" |
| 14 | `POST /groups/:groupId/join-requests` | seeker | M5 |
| 15 | `GET /groups/:groupId/join-requests` | owner | M5 inbox |
| 16 | `GET /me/join-requests` | seeker | M5 status |
| 17 | `POST /join-requests/:requestId/approve` | owner | M5 |
| 18 | `POST /join-requests/:requestId/reject` | owner | M5 |
| 19 | `POST /join-requests/:requestId/withdraw` | seeker | M5 |
| 20 | `GET /groups/:groupId/hotels` | member | M6 search |
| 21 | `POST /groups/:groupId/saved-options` / `GET` same path | member | M6 save and compare |
| 22 | `POST /groups/:groupId/saved-options/:optionId/vote` / `DELETE` | member | M6 alignment |
| 23 | `POST /groups/:groupId/booking/quote` | member | M6 confirm popup |
| 24 | `POST /groups/:groupId/booking` / `GET` same path | member | M6 finalise |

### 5.3 Meta (M1, M2, M3)

`GET /meta/destinations` → 200

```json
{ "cities": [ { "name": "Kyoto", "country": "Japan", "countryCode": "JP", "timezone": "Asia/Tokyo" } ],
  "departureCities": [ { "city": "Bengaluru", "airport": "BLR" } ],
  "dataWindow": { "from": "2027-04-01", "to": "2027-04-20" } }
```

`GET /meta/interests` → 200 `{ "items": [ { "interest": "TEMPLES", "label": "Temples and shrines", "category": "CULTURE" } ] }`. The client builds every dropdown from these two endpoints, so nothing is hard-coded.

### 5.4 Travellers (M1)

`POST /travellers`

```json
{ "name": "Priya Nair", "age": 26, "gender": "FEMALE", "homeCity": "Mumbai",
  "interests": ["TEMPLES", "STREET_FOOD", "ADVENTURE"], "genderPreference": "SAME_GENDER" }
```

→ `201` `{ "traveller": { "travellerId": "T-1001", "name": "Priya Nair", "age": 26, "gender": "FEMALE", "homeCity": "Mumbai", "homeAirport": "BOM", "interests": […], "genderPreference": "SAME_GENDER", "createdAt": "…" } }`. The client saves `travellerId` and sends it as the identity header from then on.

Validation: `name` 2–60 chars; `gender` ∈ {FEMALE, MALE}; `homeCity` ∈ departure cities; `interests` 1–16 valid IDs; `genderPreference` ∈ {ANY, SAME\_GENDER}; `age` optional, 18–99.

`GET /travellers?query=sar` → `{ items: [ { travellerId, name, gender, homeCity } ] }` for the "Continue as…" picker. `GET /me` → `{ traveller }`, or 401 when the stored ID no longer exists (the client then shows sign-up).

### 5.5 Groups (M2)

`POST /groups`

```json
{ "name": "Kyoto Spring Temples", "city": "Kyoto", "checkIn": "2027-04-10", "checkOut": "2027-04-15",
  "maxSize": 3, "budgetInr": 60000, "itinerary": "Fushimi Inari at sunrise, Nishiki Market lunch…" }
```

→ `201` `{ "group": GroupDTO }`. The server sets `ownerId = actor`, `memberIds = [actor]` and `status = maxSize === 1 ? 'FULL' : 'OPEN'`. Errors: 400 (`checkOut ≤ checkIn`, `maxSize` outside 1–4); 422 `OUT_OF_DATA_RANGE` (a city like Bangkok, or dates outside the window).

**GroupDTO** (shared by every group response):

```json
{ "groupId": "G-01", "name": "Kyoto Spring Temples", "city": "Kyoto", "country": "Japan", "timezone": "Asia/Tokyo",
  "checkIn": "2027-04-10", "checkOut": "2027-04-15", "nights": 5, "maxSize": 3, "memberCount": 1, "freeSpots": 2,
  "budgetInr": 60000, "itinerary": "…", "status": "OPEN",
  "owner": { "travellerId": "T-001", "name": "Sarah Thomas", "gender": "FEMALE" },
  "members": [ { "travellerId": "T-001", "name": "Sarah Thomas", "gender": "FEMALE", "homeCity": "Bengaluru", "isOwner": true } ],
  "viewer": { "relation": "OWNER", "requestId": null, "pendingRequestCount": 1 } }
```

`viewer.relation` ∈ `OWNER | MEMBER | PENDING | REJECTED | NONE`. The client uses it to decide which buttons to show (Interested, Pending, Open group page). `pendingRequestCount` is only filled in for the owner.

`GET /me/groups` → `{ owned: GroupDTO[], memberOf: GroupDTO[], totalPendingRequests: 2 }`. That total drives the notification badge (brief FAQ: "notification badge … for the creator").

### 5.6 Search and matches (M3, M4)

`POST /searches`

```json
{ "homeCity": "Mumbai", "city": "Kyoto", "checkIn": "2027-04-09", "checkOut": "2027-04-16",
  "interests": ["TEMPLES", "STREET_FOOD", "ADVENTURE"], "budgetInr": 62000, "genderPreference": "SAME_GENDER" }
```

The server copies `gender` from the actor's profile, stores the search, then runs the matcher. It returns `201`:

```json
{ "search": { "searchId": "S-1001", "city": "Kyoto", "checkIn": "2027-04-09", "checkOut": "2027-04-16", "nights": 7, "...": "..." },
  "matches": { "page": 1, "limit": 20, "total": 2, "items": [ {
      "groupId": "G-01", "name": "Kyoto Spring Temples", "city": "Kyoto", "checkIn": "2027-04-10", "checkOut": "2027-04-15",
      "memberCount": 1, "maxSize": 3, "freeSpots": 2, "budgetInr": 60000,
      "owner": { "travellerId": "T-001", "name": "Sarah Thomas" },
      "score": 63,
      "reasons": { "sharedNights": 5, "sharedFrom": "2027-04-10", "sharedTo": "2027-04-15",
                    "sharedInterests": ["TEMPLES", "STREET_FOOD"], "budgetDiffInr": 2000, "budgetLimitInr": 24000,
                    "gender": "Female only ↔ female only", "spotsAfterJoin": 1 },
      "viewerRequestStatus": null } ] },
  "emptyStateHints": [] }
```

The card shows the 5 fields M4 requires (name, destination, dates, member count, owner name). `reasons` turns into one line: "5 shared nights · Temples, Street food · budget ₹2k apart". When `total = 0`, `emptyStateHints` holds concrete suggestions computed from near-misses, for example `{ "type": "WIDEN_DATES", "message": "G-02 shares only 1 night; a check-out of 17 Apr would share 2" }` (brief FAQ: "suggest actions").

`GET /searches/:searchId/matches?page=2` re-runs the match on current data. Groups fill up and new groups appear, so results are never cached. Only the search's creator may call it.

`GET /searches/:searchId/groups/:groupId/evaluation` → `{ eligible, checks: [ { rule, passed, …evidence } ], failed: [] }`. This is the raw output of `evaluateMatch`, used on the group detail page to show a ✅/❌ rule list. It also works for groups that don't match, to explain why.

### 5.7 Join requests (M5)

`POST /groups/:groupId/join-requests` body `{ "searchId": "S-1001", "message": "Hi Sarah!" }`

The server checks, in order: the group exists (404); the search exists and belongs to the actor (404/403); actor ≠ owner (409 `OWN_GROUP`); not already a member (409 `ALREADY_MEMBER`); group `OPEN` (409 `GROUP_CLOSED` / `GROUP_FULL`); **`evaluateMatch(search, group, owner).eligible`** (422 `NOT_ELIGIBLE` with the failed rules); no pending request already (409 `DUPLICATE_REQUEST`, enforced by the unique index). It returns `201`:

```json
{ "request": { "requestId": "JR-1001", "groupId": "G-01", "seekerId": "T-1001", "status": "PENDING",
               "matchSnapshot": { "sharedNights": 5, "sharedInterests": ["TEMPLES", "STREET_FOOD"], "budgetDiffInr": 2000, "score": 63 },
               "createdAt": "…" } }
```

The server re-checks eligibility here because the client can't be trusted. A hand-crafted request for G-06 has to fail even if the UI never showed G-06.

`GET /groups/:groupId/join-requests?status=PENDING` (owner only) → `{ items: [ { request, seeker: { travellerId, name, age, gender, homeCity, interests } } ] }`.

`GET /me/join-requests` → the seeker's requests with group summaries and statuses.

`POST /join-requests/:requestId/approve` (owner only) → `200 { request: {…status: "APPROVED"}, group: GroupDTO }`. When the approval fills the group, it returns `closedRequestIds` too: the other pending requests, now `CLOSED`. Errors: 409 `REQUEST_NOT_PENDING`, 409 `GROUP_FULL` (the last place was taken between request and approval).

`POST /join-requests/:requestId/reject` (owner) → `200 { request }` with status `REJECTED`. `POST …/withdraw` (the seeker, only while PENDING) → `WITHDRAWN`.

### 5.8 Common Group Page: hotels, saved options, booking (M6)

Every endpoint here is **members only** (403 for anyone else).

`GET /groups/:groupId/hotels?sort=perMember|rating|stars&minStars=3&minRating=8&maxPerMemberInr=15000&planFor=CURRENT|MAX&page=1`

```json
{ "context": { "city": "Kyoto", "checkIn": "2027-04-10", "checkOut": "2027-04-15",
               "nights": ["2027-04-10", "2027-04-11", "2027-04-12", "2027-04-13", "2027-04-14"],
               "partySize": 2, "budgetInr": 60000, "timezone": "Asia/Tokyo" },
  "total": 11, "page": 1, "items": [ {
    "hotel": { "hotelId": "HTL-KYO-001", "name": "Gion Corner Hotel", "area": "Gion", "stars": 3, "rating": 7.8,
               "image": "/static/hotels/HOTEL-BUSINESS-1.jpg", "checkInFrom": "15:00", "checkOutUntil": "11:00" },
    "cheapestPerMemberInr": 11900,
    "options": [ { "roomId": "RM-KYO-001-A", "roomType": "TWIN", "name": "Twin Room", "maxAdults": 2,
                   "roomsNeeded": 1, "nights": 5, "pricePerNightInr": 4760, "totalInr": 23800, "perMemberInr": 11900,
                   "budgetSharePct": 19.8, "minRoomsLeft": 2, "refundable": true, "savedOptionId": null } ] } ] }
```

The search always uses the group's own city and dates (brief §8.1). The client can't override them, which keeps the price honest. Hotels with no option available on every night are left out. The images are served by Express from the pack's `images/` folder (credits in `ATTRIBUTIONS.md`).

`POST /groups/:groupId/saved-options` body `{ "roomId": "RM-KYO-001-A" }`. The server recomputes the price; it never trusts a price sent by the client. It returns `201 { option }` (409 `ALREADY_SAVED`, 422 `ROOMS_UNAVAILABLE`). `GET` on the same path → `{ items: [ { optionId, hotel, room, savedBy, votes: ["T-001"], voteCount: 1, memberCount: 2, allAgree: false, live: { totalInr, perMemberInr, available }, stale: false } ] }`, sorted by votes ↓ then perMember ↑. `POST …/:optionId/vote` and `DELETE …/:optionId/vote` toggle the actor's vote (idempotent).

`POST /groups/:groupId/booking/quote` body `{ "optionId": "OPT-1001" }` → `200 { hotelName, roomName, nights: 5, roomsNeeded: 1, memberCount: 2, totalInr: 23800, perMemberInr: 11900, available: true, members: [ { travellerId, name } ] }`. This is the data for the confirmation popup ("₹23,800.00 total · ₹11,900.00 each for Sarah and Priya"). It reads current `roomsLeft` and writes nothing.

`POST /groups/:groupId/booking` body `{ "optionId": "OPT-1001" }` → `201`:

```json
{ "booking": { "bookingId": "BK-2027-000001", "groupId": "G-01", "hotelId": "HTL-KYO-001", "roomId": "RM-KYO-001-A",
               "roomsBooked": 1, "nights": ["2027-04-10", "…", "2027-04-14"], "memberIds": ["T-001", "T-1001"],
               "totalInr": 23800, "perMemberInr": 11900,
               "status": "CONFIRMED", "bookedBy": "T-1001", "createdAt": "…" },
  "group": { "groupId": "G-01", "status": "BOOKED", "...": "..." } }
```

Before writing, the server re-checks membership and that the group isn't booked yet. It then reduces `roomsLeft` by `roomsBooked` on **every** night of the stay, all or nothing (§6). Errors: 409 `ALREADY_BOOKED` (the unique index on `bookings.groupId` catches a double-click), 422 `ROOMS_UNAVAILABLE` (another group took the last room on some night; nothing is changed). `GET /groups/:groupId/booking` → `{ booking }` or 404. Once booked, the group page shows the locked booking and "Total trip cost: ₹23,800.00 · ₹11,900.00 each" (brief §8.6), and other groups' hotel searches see the reduced availability.

## 6. State machines, concurrency and edge cases

Two state machines carry all mutable behaviour: one for **groups** and one for **join requests**. Every transition is a single conditional MongoDB update. Two owners clicking at once, or a seeker double-clicking, therefore can't overfill a group or create two bookings. This works without multi-document transactions, so a plain single-node Mongo is enough.

**Group: `OPEN → FULL → BOOKED`** (also `OPEN → BOOKED` when a group books before it's full).

| From | Event | To | Guard (inside the same atomic update) |
| --- | --- | --- | --- |
| OPEN | approve, members reach `maxSize` | FULL | `status: 'OPEN'`, `memberIds.length < maxSize`, seeker not in `memberIds` |
| OPEN | approve, members < `maxSize` | OPEN | same |
| OPEN / FULL | booking created | BOOKED | `status ≠ BOOKED`, plus the unique `bookings.groupId` |

**Join request: `PENDING → APPROVED | REJECTED | WITHDRAWN | CLOSED`.** All of these are final. A rejected seeker may send a new request, which creates a new document; the partial unique index only blocks a second *pending* one.

**Atomic approve: two steps, each guarded, in a safe order**

```js
// 1) claim the request: only one approver can win
const req = await JoinRequest.findOneAndUpdate(
  { requestId, status: 'PENDING' }, { $set: { status: 'APPROVED', decidedBy: actor, decidedAt: new Date() } }, { new: true });
if (!req) throw conflict('REQUEST_NOT_PENDING');

// 2) add the member and set the status in ONE pipeline update, re-checking capacity on the server
const group = await Group.findOneAndUpdate(
  { groupId: req.groupId, ownerId: actor, status: 'OPEN', memberIds: { $ne: req.seekerId },
    $expr: { $lt: [{ $size: '$memberIds' }, '$maxSize'] } },
  [ { $set: { memberIds: { $concatArrays: ['$memberIds', [req.seekerId]] } } },
    { $set: { status: { $cond: [{ $gte: [{ $size: '$memberIds' }, '$maxSize'] }, 'FULL', 'OPEN'] } } } ],
  { new: true });

if (!group) {                       // the last place was taken in the meantime
  await JoinRequest.updateOne({ requestId }, { $set: { status: 'CLOSED' } });
  throw conflict('GROUP_FULL');
}
if (group.status === 'FULL')        // close everyone else who was waiting
  await JoinRequest.updateMany({ groupId: group.groupId, status: 'PENDING' }, { $set: { status: 'CLOSED' } });
```

Ownership is checked in step 1 before the claim (load the request, then the group, then compare `ownerId`, else 403). It is checked again by `ownerId: actor` in step 2.

**Atomic booking with availability reduction.** A booking must reduce `roomsLeft` on every night of the stay, or on none. Two groups booking the last room on the same night must not both succeed. Each night is updated with a conditional `$inc`. If any night fails, the nights already reduced are given back and the booking is removed (a compensating rollback). This works on a plain single-node Mongo.

```js
// services/bookingService.js
async function book(actor, groupId, optionId) {
  const group = await loadGroupForMember(groupId, actor);           // 403 / 404
  if (group.status === 'BOOKED') throw conflict('ALREADY_BOOKED');
  const option = await SavedOption.findOne({ optionId, groupId });   // 404
  const room = await Room.findOne({ roomId: option.roomId }).lean();
  const m = group.memberIds.length;
  const rooms = Math.ceil(m / room.maxAdults);
  const nights = nightsOf(group);
  const totalInr = room.pricePerNightInr * rooms * nights.length;

  // 1) claim the group's single booking slot: the unique index on groupId makes this race-safe
  let booking;
  try {
    booking = await Booking.create({ bookingId: await nextId('booking'), groupId, optionId, hotelId: room.hotelId,
      roomId: room.roomId, roomsBooked: rooms, nights, memberIds: group.memberIds,
      totalInr, perMemberInr: round2(totalInr / m), bookedBy: actor, status: 'CONFIRMED' });
  } catch (e) { if (e.code === 11000) throw conflict('ALREADY_BOOKED'); throw e; }

  // 2) reduce each night only if enough rooms are still left
  const done = [];
  for (const date of nights) {
    const r = await Availability.updateOne({ roomId: room.roomId, date, roomsLeft: { $gte: rooms } },
                                           { $inc: { roomsLeft: -rooms } });
    if (r.modifiedCount !== 1) {                                          // sold out that night
      await Availability.updateMany({ roomId: room.roomId, date: { $in: done } }, { $inc: { roomsLeft: rooms } });
      await Booking.deleteOne({ bookingId: booking.bookingId });
      throw unprocessable('ROOMS_UNAVAILABLE', { date });
    }
    done.push(date);
  }

  // 3) lock the group and close anyone still waiting
  await Group.updateOne({ groupId, status: { $ne: 'BOOKED' } }, { $set: { status: 'BOOKED' } });
  await JoinRequest.updateMany({ groupId, status: 'PENDING' }, { $set: { status: 'CLOSED' } });
  return booking;
}
```

Why this order: step 1 runs first, so two members clicking Book at the same time can't both reduce rooms. Only the one that wins the unique `groupId` insert reaches step 2. The `roomsLeft: { $gte: rooms }` filter makes each night's check-and-reduce a single atomic operation, so two **different** groups can never push a night below 0.

The remaining gap is a server crash between steps 1 and 3, which would leave a booking with only part of its nights reduced. That's acceptable for a demo; say so in the README's known limitations. **Upgrade path:** run Mongo as a single-node replica set (`command: ["--replSet", "rs0"]` in docker-compose plus a one-time `rs.initiate()`; `MongoMemoryReplSet` in tests), wrap steps 1–3 in `session.withTransaction()`, and delete the compensation code.

**Edge cases and the expected behaviour**

| Case | Behaviour |
| --- | --- |
| City outside the 5 (for example Bangkok) | 422 `OUT_OF_DATA_RANGE`: "We only have data for Tokyo, Kyoto, Osaka, Dubai and Abu Dhabi" |
| `checkIn` 31 Mar or `checkOut` 21 Apr | 422 `OUT_OF_DATA_RANGE` naming the 1–20 Apr 2027 window |
| `checkOut ≤ checkIn`, or `2027-04-31` | 400 `VALIDATION_ERROR` |
| A 1-night search | Valid, but it can never meet R2; return no matches with the hint "stay at least 2 nights" |
| Budget exactly 40% apart (60k vs 84k) | Match (inclusive); 85k doesn't match. Integer comparison |
| Back-to-back stays (out 14 Apr, in 14 Apr) | 0 shared nights, so no match |
| Seeker's own group, or already a member | Left out of matches; a forced request returns 409 |
| Seeker never searched (no `searchId`) | 400; the request must come from a search, since the rules use the search's interests and budget |
| Group already FULL (seed G-07) | Never matched; Interested is disabled on direct view (brief FAQ) |
| `maxSize: 1` | Valid per M2, created as FULL; it never matches anyone (consistent with R6) |
| Owner alone on the group page | Allowed; hotels priced for 1 (or `planFor=MAX`) |
| Saved option goes stale (new member joined) | Live recompute, `stale: true`, plus a "price updated" chip |
| An option sells out between quote and booking | 422 `ROOMS_UNAVAILABLE`; the client refreshes the options |
| Double-click on Book or Interested | Unique indexes plus 409; the client disables the button while the request is in flight |
| Backend restart in the middle of the demo | All state is in Mongo; the seed is insert-only, so nothing resets |

## 7. Testing strategy

Correctness carries 25% of the judging, so the matching rules get boundary tests on both sides of every threshold. Those tests run in under 2 seconds with `npm test`, before every hourly push.

**Layers**

| Layer | Tool | Scope | Target |
| --- | --- | --- | --- |
| Domain unit | Jest | `dates`, `matching`, `ranking`, `pricing`: pure, no DB | 100% of branches |
| API integration | supertest + mongodb-memory-server | each endpoint: happy path, auth (401/403), the main 409/422 cases | every M1–M6 endpoint |
| End-to-end flow | supertest script | the demo scenario A + B as one test | 1 test, must stay green |
| Smoke on boot | catalog validation | broken file paths or references cause the app to exit with a message | at boot |

**Golden cases (`tests/domain/matching.test.js`)**

| # | Case | Expected |
| --- | --- | --- |
| 1 | Priya's search against all 12 seed groups | exactly `[G-01, G-08]`, G-01 first |
| 2 | Same search, check the failing rule of each non-match | G-02 DATES, G-03 CITY, G-04 BUDGET, G-05 INTERESTS, G-06 GENDER, G-07 SIZE |
| 3 | Budget 60,000 vs 84,000 / 85,000 | match / no match |
| 4 | Shared nights exactly 2 / exactly 1 / back-to-back | match / no / no |
| 5 | Shared interests 2 / 1 (and the same interest twice in the input) | match / no; duplicates counted once |
| 6 | Gender matrix: F-SAME vs F-SAME, F-ANY vs M-ANY, M-ANY vs F-SAME owner, F-SAME vs M-ANY owner (G-06) | yes / yes / no / no |
| 7 | Capacity: members 2 of 3 / 3 of 3 | match / no |
| 8 | Kyoto vs Osaka with identical everything else | no |
| 9 | Interests compared with the owner, not other members (G-05 has 2 members) | uses the owner only |

**Pricing and availability cases**

| # | Case | Expected |
| --- | --- | --- |
| 10 | G-01, 2 members, RM-KYO-001-A | 1 room, ₹23,800 total, `perMemberInr` 11900 |
| 11 | 3 members, TWIN | 2 rooms, ₹47,600, `perMemberInr` 15866.67 |
| 12 | One night with `roomsLeft = 0` (61 such nights in the data) | option excluded |
| 13 | Book G-01 in RM-KYO-001-A | `roomsLeft` on 10–14 Apr goes from 6, 2, 4, 3, 3 to 5, 1, 3, 2, 2; other nights unchanged |
| 14 | A booking needs 2 rooms; one night has 1 left | 422 `ROOMS_UNAVAILABLE`, **every** night back to its earlier value, no booking document |
| 15 | Restart after a booking | reduced `roomsLeft` kept (insert-only seed); `npm run reset` restores `initialRoomsLeft` |

**Integration and concurrency**

- Persistence: create a user and a group, approve a request, restart the app (re-run boot against the same memory server), then check that the state is unchanged and the seed didn't overwrite it.
- Race: fire two approvals in parallel for a group with one free place. Exactly one succeeds, the other gets 409 `GROUP_FULL`, and the member count equals `maxSize`.
- Double booking: two parallel `POST /booking` calls give one 201 and one 409.
- Security: a request to G-06 forged with Priya's search gives 422 `NOT_ELIGIBLE`; a non-member calling `/hotels` gets 403.

**Judge-request rehearsal.** Script the likely live asks: "add a new traveller with different dates", "make it 3 shared interests", "a male seeker", "a group in Dubai". Each should be a form entry or a one-constant change with the tests still passing.

## 8. Traceability matrix

Every Must-have item and matching rule maps to one module, its endpoints, its collections and at least one test. A judge's question like "where is the budget rule?" has a one-file answer.

| Requirement | Module(s) | Endpoint(s) | Collection(s) | Test(s) |
| --- | --- | --- | --- | --- |
| M1 Sign up, persists | `travellerService`, `identify` middleware | `POST /travellers`, `GET /travellers`, `GET /me` | travellers, counters | API: create, then `GET /me` after restart |
| M2 Create a group post | `groupService.create`, `validators/group` | `POST /groups`, `GET /groups/:id`, `GET /me/groups` | groups, cities | API: valid, bad dates, Bangkok → 422 |
| M3 Traveller search | `searchService.create` | `POST /searches` | searches | API: gender copied from profile |
| M4 See matches | `domain/matching`, `domain/ranking`, `searchService.matches` | `POST /searches`, `GET /searches/:id/matches`, `…/evaluation` | groups, travellers | golden #1–9 |
| M5 Accept or decline | `joinRequestService` | `POST /groups/:id/join-requests`, `GET …/join-requests`, `POST /join-requests/:id/approve\|reject\|withdraw`, `GET /me/join-requests` | joinRequests, groups | race test, forged-request test |
| M6 Group page and hotels | `domain/pricing`, `hotelService` | `GET /groups/:id/hotels`, `…/saved-options`, `…/vote` | hotels, rooms, availability, savedOptions | pricing #10–12 |
| M6 Book CTA and cost per member | `bookingService` (§6), `round2` | `POST …/booking/quote`, `POST …/booking`, `GET …/booking` | bookings, availability, groups | #13–15, double-book test |
| R1 Same city | `matching` check `SAME_CITY` | via M4 | – | #8 |
| R2 ≥ 2 shared nights | `dates.sharedNights`, `RULES.MIN_SHARED_NIGHTS` | via M4 | – | #4 |
| R3 Budget ≤ 40% of the lower | `RULES.BUDGET_TOLERANCE` | via M4 | – | #3 |
| R4 ≥ 2 interests with the owner | `RULES.MIN_SHARED_INTERESTS` | via M4 | – | #5, #9 |
| R5 Gender, both ways | `allows()` in `matching` | via M4 | – | #6 |
| R6 Group size | `matching` + approve guard (§6) | via M4 and approve | groups | #7, race test |
| Persistence after restart | MongoDB, insert-only `seed` | all | all | persistence test, #15 |
| Backend holds the logic | domain + services; the client only renders | all | – | code review: no rule code in `client/` |
| Dates and cities inside the data | `validators`, `DATA_WINDOW`, `cities` | M2, M3 | cities | API: 422 cases |
| Catalog files untouched | `db/seed.js` reads them only | – | catalog collections | boot validation; `git diff data/` is empty |

## 9. Roadmap after the Must-haves

Build in this order: G1 and G2 (cheap, they reuse existing data), then S1 chat, then the standout features ranked by judging impact per hour. Each item below names the backend change it needs, so the architecture above doesn't have to be redone.

### 9.1 Good to have (from the brief)

| ID | Feature | Backend change | Effort |
| --- | --- | --- | --- |
| G1 | Filter results by shared interest and gender composition | `GET /searches/:id/matches?sharedInterest=TEMPLES&genderComposition=ALL_FEMALE\|ALL_MALE\|MIXED`. Composition is computed from the members' genders (join the members, not just the owner). Filters run **after** the 6 rules and only narrow the results, never widen them | 1–2 h |
| G2 | Member profile pages | `GET /travellers/:id` gains `groups: [{ groupId, name, city, checkIn, role: OWNER\|MEMBER }]` and age, home city and interests. Pending requests stay private | 1 h |

### 9.2 Stretch (from the brief)

| ID | Feature | Backend change | Effort |
| --- | --- | --- | --- |
| S1 | Group chat on the Common Group Page | New `messages` collection `{ messageId, groupId, authorId, body ≤ 1000, createdAt }`, index `{ groupId: 1, createdAt: 1 }`. `GET /groups/:id/messages?after=<ISO>` plus `POST /groups/:id/messages`, members only. Start with 3-second polling (simplest and reliable at the demo); upgrade to Socket.IO rooms (`group:<id>`) if time allows | 2–4 h |

### 9.3 Standout ideas (my suggestions, not in the brief)

Ordered by how directly they move a judging criterion:

| # | Feature | Judging criterion it moves | Backend sketch | Effort |
| --- | --- | --- | --- | --- |
| X1 | "Why not?" near-miss explainer: groups that fail exactly one rule, with the exact change that would fix it ("move check-out to 17 Apr to share 2 nights", "raise budget to ₹63,500") | UX 15% (clear match reason), plus the empty-state FAQ | `evaluateMatch` already returns evidence; add `nearMisses` (failed.length === 1, not CITY or GENDER) with a computed fix | 2 h |
| X2 | Match breakdown panel: score bars per component, with the weights visible | UX + individual understanding (explain your ranking) | Return the component values in `reasons` | 1 h |
| X3 | Availability calendar on the group page: rooms left per night for each option, with sold-out nights shown | Makes the (now real) inventory reduction visible in the demo | `GET /groups/:id/hotels/:hotelId/availability` from the `availability` collection | 1–2 h |
| X4 | Mixed-room optimiser: cheapest mix of room types for the party (TWIN + SINGLE for 3) | Product value: cheaper per-person cost | Small DP over room types per hotel (party ≤ 4, so it's trivial); reduce each room type's `roomsLeft` in the same booking flow | 2–3 h |
| X5 | Consensus meter: votes per saved option, an "everyone agrees" badge, Finalize highlighted when all members voted | Group coordination UX | Already backed by `votes[]`; add `allAgree` | 1 h |
| X6 | Price-if-full toggle: what each pays when the group fills to `maxSize` | Cost clarity | `planFor=MAX` (already in the contract) | 0.5 h |
| X7 | Waitlist for full groups (named in the brief FAQ) | Edge-case handling | `joinRequests.status = WAITLISTED`; promote the earliest if a member leaves or a request is withdrawn | 2 h |
| X8 | Match alerts: saved searches re-checked when a new group is posted, shown as a badge | Seeker UX | On `POST /groups`, run stored searches for that city; write `notifications` | 2–3 h |
| X9 | Group activity feed: joined, saved option, voted, booked | Coordination UX, auditability | `activities` collection written by services | 1–2 h |
| X10 | Budget tracker: hotel per-person cost against the group budget, with what's left for activities | Cost clarity | Derived from the booking and `budgetInr` | 0.5 h |
| X11 | `.ics` calendar export for the booked stay, plus a shareable invite link to the group | Polish | `GET /groups/:id/booking.ics`; signed invite token | 1–2 h |
| X12 | Demo tooling: `npm run reset`, a seed-persona switcher, request-ID logging | Live-demo reliability | Reset already planned in §3 | 0.5 h |
| X13 | Transactions: single-node replica set + `withTransaction` for booking | Engineering quality | Upgrade path in §6 | 1 h |

**Suggested sequence:** M1–M6 with tests, then X12 (demo safety), G1, G2, X1, X2, X5, S1 (polling), X6/X10, then X3/X4 if time remains. Keep every addition behind the same `domain` and `services` boundaries, so a judge's live change still touches one file.
