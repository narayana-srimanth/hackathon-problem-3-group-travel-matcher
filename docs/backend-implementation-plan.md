# Group Travel Matcher — Backend Implementation Plan

Source documents: `problem-3-group-travel-matcher.md` (brief), `DATA_DICTIONARY.md`, `Group Travel Matcher — Backend Architecture (MERN).md` (internals), `Group Travel Matcher — API Specification v1.md` (wire contract).

**Precedence rule:** where the two design docs disagree, the API spec wins for anything on the wire (paths, fields, status codes, error envelope); the architecture doc wins for internals (layers, models, seeding, atomic updates). Known differences are listed in §4.

Verified against the data before planning: Priya's search (Kyoto, 9→16 Apr, ₹62,000, TEMPLES/STREET_FOOD/ADVENTURE, F/SAME_GENDER) matches exactly **G-01 (score 63.3 → 63)** and **G-08 (58.4 → 58)**, and each other Kyoto group fails exactly the rule the architecture doc's golden table says. RM-KYO-001-A has 6, 2, 4, 3, 3 rooms on 10–14 Apr. Data pack: 24 travellers, 12 groups, 16 interests, 49 hotels, 125 rooms, 2,500 availability rows (20 nights × 125 rooms, no gaps).

---

## 1. Target layout

```text
/
├─ docker-compose.yml            mongo:7, port 27017, named volume
├─ package.json                  workspaces: ["server"] (client added later); scripts dev / test / reset / seed
├─ data/  images/                untouched data pack
└─ server/
   ├─ package.json
   ├─ src/
   │  ├─ server.js               connect → validateDataPack → seed → syncIndexes → listen
   │  ├─ app.js                  createApp(): middleware, /static/hotels, /api/v1 router, 404, errorHandler
   │  ├─ config/env.js           PORT=4000, MONGO_URI, DATA_DIR (default ../data), IMAGES_DIR
   │  ├─ db/                     connect.js, dataPack.js (load + validate), seed.js, reset.js, counters.js
   │  ├─ models/                 Traveller, Group, Search, JoinRequest, SavedOption, Booking, Counter,
   │  │                          City, DepartureCity, Interest, Hotel, Room, Availability
   │  ├─ domain/                 constants, dates, matching, ranking, hints, pricing, messages   (pure, no I/O)
   │  ├─ services/               meta, traveller, group, search, joinRequest, hotel, savedOption, booking
   │  ├─ dto/                    toTraveller, toGroup (viewer), toMatchCard, toJoinRequest, toSavedOption, toBooking
   │  ├─ controllers/  routes/  validators/ (zod schemas)
   │  ├─ middleware/             requestId, identify, validate, asyncHandler, errorHandler
   │  └─ errors.js               AppError + helpers: badRequest, unauthenticated, forbidden, notFound, conflict, unprocessable
   └─ tests/
      ├─ domain/                 dates, matching (golden), ranking, hints, pricing
      ├─ api/                    one file per resource + flow.test.js (demo A+B) + concurrency.test.js
      └─ helpers/                testApp (memory Mongo + seed), request builders
```

**Stack:** Node 20+, Express 4 (+ a tiny `asyncHandler`, since Express 4 doesn't catch rejected promises), Mongoose 8, zod 3, Jest + supertest + mongodb-memory-server, nodemon, ESLint + Prettier. Module system: **CommonJS** (recommended, see question Q6) so Jest runs with zero config.

---

## 2. Phases

Each phase ends green (`npm test`) and as one or more commits, so the Git history tells the story the judges check.

### Phase 0 — Scaffolding (≈30 min)
- Root + server `package.json`, `.gitignore` (node_modules, coverage, .env), `.editorconfig`, ESLint/Prettier.
- `docker-compose.yml` (mongo:7, volume `mongo-data`).
- Scripts: `dev` (nodemon server), `start`, `test`, `seed`, `reset`.
- `GET /api/v1/health` stub so the skeleton boots end to end.

### Phase 1 — Cross-cutting HTTP plumbing (≈1 h)
- `errors.js`: `AppError(status, code, message, details=[])`.
- `requestId` middleware: `req_` + 6 hex chars; set `X-Request-Id` header; attach to logs.
- `errorHandler`: `AppError` → envelope `{ error: { code, message, details, requestId } }`; malformed JSON body → 400 `VALIDATION_ERROR`; Mongo duplicate key not handled by a service → 409 fallback; anything else → 500 `INTERNAL` (logged with stack and requestId).
- `validate({ body, query })`: zod `.strict()` for bodies (unknown field → 400), coerced numbers for queries, issues mapped to `details: [{ field, issue }]`. Content-Type check for bodies.
- `identify`: reads `X-Traveller-Id`, loads the traveller (lean), sets `req.actor`; missing/unknown → 401.
- Path-param guards: regex per param (`^G-\d+$`, …); malformed → 404 `NOT_FOUND` (spec §2.1).
- `paginate(query)` helper: `page ≥ 1`, `1 ≤ limit ≤ 50`, default 20 → `{ skip, limit, page }`, plus `toPage(items, page, limit, total)`.
- Catch-all 404 for unknown routes (envelope).

### Phase 2 — Domain modules, test-first (≈2 h) — the 25% correctness work
- `constants.js`: `RULES { MIN_SHARED_NIGHTS: 2, BUDGET_TOLERANCE_PCT: 40, MIN_SHARED_INTERESTS: 2 }`, `DATA_WINDOW`, `GROUP_SIZE`, `RANK_WEIGHTS`, `PAGE`, `RULE_ORDER`.
- `dates.js`: `toDay`, `fromDay`, `isValidIsoDate`, `nightCount`, `nightsOf`, `sharedNights`, `sharedRange` (→ `sharedFrom`, `sharedTo`), `inDataWindow`.
- `matching.js`: `evaluateMatch(search, group, owner)` → `{ eligible, checks[6], failed[] }`, all rules always evaluated, evidence on each check, fixed order. Budget rule in integers: `diff * 100 <= PCT * lo`; `limitInr = floor(PCT * lo / 100)`. Interests de-duplicated and compared with the **owner** only.
- `messages.js`: human strings for every rule, pass and fail (e.g. `"5 shared nights (10–15 Apr)"`, `"Budgets differ by ₹25,000; the limit is ₹24,800"`, gender label `"Female only ↔ female only"` / `"Anyone ↔ male"`), and NOT_ELIGIBLE detail text. Kept separate so wording changes don't touch rules.
- `ranking.js`: `scoreMatch(evaluation, search, group, owner)` with the 4 normalised components (guard `maxSize − 1 = 0`), `round(100 × Σ)`, `compareMatches` for the 5-level tie-break; also return the components (cheap win for the UX "why this rank" panel).
- `hints.js`: `buildEmptyStateHints(search, evaluations)` (rules in §3, Q2).
- `pricing.js`: `round2`, `round1`, `priceOption(room, stay, partySize, availabilityMap)`, `budgetSharePct`.
- Tests: all golden cases #1–#12 from the architecture doc §7, plus boundaries on both sides of every threshold, Feb/30-Apr/31-Apr date validity, duplicate interests, tie-break determinism.

### Phase 3 — Models, data-pack import, seed, reset (≈1.5 h)
- 13 Mongoose models, business keys unique-indexed, `_id`/`__v` never exposed (DTO mappers do the projection). Indexes per architecture §2, including the **partial unique** `{ groupId, seekerId }` where `status: 'PENDING'` and unique `bookings.groupId`, `savedOptions {groupId, roomId}`, `availability {roomId, date}`.
- `dataPack.js`: read the 7 JSON files, map snake_case → camelCase, validate references (room→hotel, availability→room, group owner/members→travellers, group city ∈ 5 cities, traveller interests ∈ interests, owner ∈ member_ids, `member_ids.length ≤ max_size`). Exit with a clear message on failure.
- `seed.js`: `bulkWrite` of `updateOne({ key }, { $setOnInsert: doc }, { upsert: true })` per collection, in dependency order; derived group `status` (`G-07` → FULL); `availability.initialRoomsLeft`; `timestamps: false` on the bulk ops so restarts truly change nothing.
- `counters.js`: `nextId(kind)` with `$inc` upsert. Starting values: traveller/group/search/joinRequest/option start at 1000 (first id `…-1001`); booking starts at 0 (`BK-2027-000001`) — see Q8.
- `reset.js` (`npm run reset`): drop all 13 collections, re-seed.
- Tests: seed twice → identical counts; mutate (add member, reduce roomsLeft) → re-seed → mutation kept.

### Phase 4 — Meta + travellers: E01–E07 (≈1 h)
- E01 health (`mongoose.connection.readyState` + `db.admin().ping()`), E02 interests (file order), E03 destinations (catalog order: Japan cities then UAE; `dataWindow`).
- E04 sign-up: zod schema; `homeAirport` derived from DepartureCity; interests validated against the Interest collection and de-duped; new `T-1001+`.
- E05 list with case-insensitive `query` (regex-escaped), sorted by `travellerId`, paginated.
- E06 profile + `groups[]` (owner/member roles, no pending), E07 `/me`.

### Phase 5 — Groups: E08–E10 (≈1.5 h)
- `validators/group.js` with the shared date/city validation pipeline (Q3 for 400-vs-422 order): shape → 400; city ∉ 5 or dates outside window → 422 `OUT_OF_DATA_RANGE` with the standard message; `checkOut ≤ checkIn` → 400.
- `groupService.create`: owner = actor, `memberIds = [actor]`, status `FULL` iff `maxSize === 1`.
- `toGroup(group, { travellersById, cityInfo, viewer })` DTO: country/timezone from City, `nights`, `freeSpots`, owner, members (owner first then join order — `memberIds` is append-only so array order *is* join order), `viewer` computed from the actor's latest join request for that group (Q4) and `pendingRequestCount` for the owner.
- Batch loader so E10 and list endpoints do one `$in` query for travellers, one aggregate for pending counts, one for the viewer's requests — no N+1.
- E10 owned / memberOf sorted by `checkIn` then `groupId`; `totalPendingRequests`.

### Phase 6 — Searches & matches: E11–E14 (≈2 h)
- E11: validate (same pipeline as groups + interests + `limit`), copy `gender` from profile, store `S-1001+`, run `matchService.run(search, actor, { page, limit })`.
- `matchService.run`: `Group.find({ city, status: 'OPEN' })` → pre-filter owner/member → load owners and members (`$in`) → `evaluateMatch` each → eligible ones scored and sorted → G1 filters (E13 only) → paginate → `toMatchCard` with `reasons` and `viewerRequestStatus` (one `$in` query on the seeker's requests).
- Empty-state hints when `total === 0` (Q2).
- E12 (search owner only: 404 then 403), E13 (G1 filters `sharedInterest` repeatable — Q1 — and `genderComposition` ALL_FEMALE | ALL_MALE | MIXED over current members), E14 (`evaluateMatch` + messages for any group, including other cities and non-OPEN groups).

### Phase 7 — Join requests: E15–E20 (≈2.5 h)
- E15 in the exact order the spec lists; matchSnapshot (sharedNights, sharedInterests, budgetDiffInr, score); insert; duplicate key on the partial index → 409 `DUPLICATE_REQUEST`. **TOCTOU guard:** after inserting, re-read the group; if it's no longer OPEN, mark the new request CLOSED and return 409 `GROUP_FULL`/`GROUP_CLOSED` (prevents a PENDING request stranded on a FULL group when an approval lands between the check and the insert).
- E16 owner inbox (default PENDING, `ALL` for history, oldest first, seeker full profile). E17 seeker list (newest first, group summary).
- E18 approve: load request → group → owner check (403) → conditional claim PENDING→APPROVED → pipeline update that appends the member and sets FULL/OPEN with the capacity guard → on failure, set the request CLOSED and re-read the group to return the right code (`GROUP_CLOSED` if BOOKED, else `GROUP_FULL`) → if FULL, close every other PENDING request and return their ids in `closedRequestIds`.
- E19 reject, E20 withdraw: conditional `{ status: 'PENDING' }` updates; `decidedBy`/`decidedAt` set (withdraw: `decidedBy` = seeker).
- Tests: whole lifecycle, re-request after REJECTED, forged G-06 request → 422 with `details[].rule = GENDER`, parallel approvals for one free spot → exactly one 200, one 409, `memberCount === maxSize`.

### Phase 8 — Hotels, saved options, votes: E21–E26 (≈2.5 h)
- `requireMember(groupId, actor)` service helper: 404 unknown group, 403 non-member.
- E21: 3 indexed queries (hotels by city, rooms by hotelIds, availability by roomIds × nights) → `priceOption` per room → filters (`minStars`, `minRating`, `roomType`, `maxPerMemberInr`) → drop unavailable options and empty hotels → options sorted by `perMemberInr`, hotels sorted by `sort` (tie-break `hotelId`) → paginate → `savedOptionId` from the group's saved options. `planFor=MAX` uses `maxSize`.
- E22 save: room exists **and** its hotel is in the group's city (else 404), group not BOOKED (409 `GROUP_CLOSED`), priced with the current party, unavailable → 422 `ROOMS_UNAVAILABLE` with `details[0].date`, unique index → 409 `ALREADY_SAVED`; saver's vote added.
- E23 list with live repricing, `stale`, `allAgree`; sorted by `voteCount` ↓, `live.perMemberInr` ↑, then `optionId`.
- E24 delete (saver or owner, 403 otherwise; 409 when BOOKED). E25/E26 idempotent `$addToSet` / `$pull` (409 when BOOKED).
- Tests: worked example (₹23,800 / ₹11,900; 3 members → 2 rooms, ₹47,600, 15866.67), sold-out night excluded, non-member 403, stale flag after an approval.

### Phase 9 — Booking: E27–E29 (≈2 h)
- E27 quote: read-only, live price with current members, `available`, member names; 409 `ALREADY_BOOKED` when a booking exists.
- E28 book, as in architecture §6: claim the booking via the unique `groupId` index (11000 → 409 `ALREADY_BOOKED`) → per-night conditional `$inc` → compensate on the first failure (give rooms back, delete booking, 422 `ROOMS_UNAVAILABLE` with the date) → group `BOOKED`, close PENDING requests → `201 { booking, group }`.
- E29 get booking (404 "This group has no booking yet.").
- Tests: rooms 6,2,4,3,3 → 5,1,3,2,2 with other nights untouched; failing night restores every night and leaves no booking; parallel double-book → one 201, one 409; after booking, other groups' E21 sees the reduced availability; E22/E25 return 409 `GROUP_CLOSED`.

### Phase 10 — End-to-end, README, demo hardening (≈1.5 h)
- `flow.test.js`: demo A + B as one test (sign up Priya → search → G-01 first → interested → Sarah approves → both see hotels → save → vote → quote → book → availability reduced → restart app against the same DB → state intact).
- README: 2-command start (`docker compose up -d mongo`, `npm run dev`), architecture summary, ranking formula, endpoints, what's finished, known limitations (spoofable identity header by design, compensation not crash-safe, ₹0.01 rounding display, single room type per option).
- Seeded demo personas list; `npm run reset` before the slot.

Rough total: **~17 h** for one developer, Must-haves plus G1/G2 (both are already in the contract and cost little once matching exists). S1 chat (~2–3 h) after that if time allows.

---

## 3. Defaults I'll use where the spec is silent (override any of these)

| # | Gap | Default |
|---|---|---|
| D1 | `sharedInterest` repeated in E13 | **AND**: the group must share every selected interest (with the owner, same as the rule) |
| D2 | `emptyStateHints` | Only when `total === 0`. From same-city OPEN groups failing exactly one of DATES/BUDGET/SHARED_INTERESTS (WIDEN_DATES with the exact date change, ADJUST_BUDGET with the budget that would pass, ADD_INTERESTS naming owner interests to add); OTHER_CITY when a group in another city passes all 5 other rules. No hints for GENDER or GROUP_SIZE. Max 3, ordered by group score. A 1-night search always gets the "Stay at least 2 nights" hint (type WIDEN_DATES, no groupId). |
| D3 | 400 vs 422 when both apply | All 400 checks first (types, required, enum, impossible date, `checkOut ≤ checkIn`), then 422 range checks (city, window) |
| D4 | `viewer.relation` / `viewerRequestStatus` | Based on the seeker's **latest** request for the group. relation: PENDING → `PENDING`, REJECTED → `REJECTED`, WITHDRAWN/CLOSED → `NONE`. `viewerRequestStatus` returns the latest status as-is |
| D5 | E17 default `status` | `ALL` (E16 keeps the spec default `PENDING`) |
| D6 | Unknown **query** params | Ignored (only unknown **body** fields are 400) |
| D7 | Hotel sort ties | `hotelId` ascending; options within a hotel tie on `roomId` |
| D8 | Booking requires `allAgree`? | No: any member can finalise (brief FAQ); the client highlights it when `allAgree` |
| D9 | Booking id | `BK-<checkIn year>-<6-digit seq>`, counter starts at 0 → `BK-2027-000001` |
| D10 | Approve re-checks the 6 rules? | No, capacity only (as the spec says): search, group and owner profile are immutable in v1 |

---

## 4. Review feedback on the two design docs

Ordered by how much they would hurt.

1. **The API spec is missing two of the six rule definitions.** In §7's rule table the `BUDGET` and `SHARED_INTERESTS` cells render as a lone backtick — the `|a − b|` pipe inside the code span broke the Markdown table. For "the single source of truth" that's the most important table in the doc. Fix: escape the pipe or write `abs(a − b) ≤ 40% × min(a, b)`.
2. **Join-request race the docs don't cover.** E15 checks "not FULL" then inserts. If an approval fills the group between the two, the approval's "close every other PENDING" has already run, and the new request stays PENDING on a FULL group forever. Fix planned in Phase 7 (re-read after insert).
3. **Approve failure code is underspecified.** Step 2 failing can mean "full" or "booked" (or seeker already a member). The sketch always throws `GROUP_FULL`; the spec also promises `GROUP_CLOSED`. Need a re-read to pick the code (planned).
4. **ESM sample code + Jest.** The architecture snippets use `export`; Jest on native ESM needs `--experimental-vm-modules` and has rough edges with mocks. Either write CommonJS (my recommendation) or switch to Vitest.
5. **`mongodb-memory-server` downloads a ~100 MB mongod on first run.** Fine at home, risky on hackathon Wi-Fi; run `npm test` once beforehand to cache it. (It's also blocked in this cloud container, so here I'd test against a Docker Mongo.)
6. **Booking compensation isn't crash-safe**, and for a few ms a concurrent `GET /booking` can see a booking that's about to be rolled back. The doc already admits the crash gap; it's acceptable, but since `docker-compose` is ours anyway, a single-node replica set + `withTransaction` is ~1 h and removes both problems. Worth doing if time allows.
7. **Counters "start at 1000" contradicts `BK-2027-000001`**, and it isn't said whether "2027" is fixed or the stay year (D9).
8. **`/health` 503 body breaks the "every non-2xx has the same envelope" rule.** Minor; either exempt it explicitly or wrap it.
9. **`nights` means two things**: an `ISODate[]` in `Booking` and hotels `context`, a number in `RoomOption` and `BookingQuote`. Easy to trip over on the client. Consider `nightDates` for the arrays.
10. **E29 uses `404 NOT_FOUND` for both "unknown group" and "not booked yet"**, so the client can't tell them apart by code (the spec says to switch on code, not message). Low risk because the group page loads the group first, but `200 { booking: null }` or a distinct code would be cleaner.
11. **The docs drift from each other** (envelope without `requestId`, E05 without pagination, 4 vs 6 snapshot fields, `JR-0007` vs `JR-1001`, search budget `> 0` vs `1,000–10,000,000`). Neither says which wins; I'm following the API spec for anything on the wire. Worth one sentence in both docs.
12. **Budget rule in floats.** `diff * 10 <= 0.4 * 10 * lo` works for 0.4 but looks like magic in a live-change Q&A. An integer percent constant (`BUDGET_TOLERANCE_PCT = 40`, `diff * 100 <= 40 * lo`) is exact for any whole percent and easier to explain.
13. **Mongoose timestamps on the upsert seed** will `$set updatedAt` on every boot, so "later boots change nothing" isn't literally true. Harmless; disabled in the plan.
14. **Identity is spoofable by design** (any `X-Traveller-Id`). Fine for M1; list it under known limitations so a judge doesn't find it first.
15. **Naming in the demo data**: the seeded traveller T-002 is "Priya Shah" while the docs' sign-up example is "Priya Nair" (T-1001). Both have the same profile, so either works on stage, but pick one for the script.

What's strong and worth keeping as is: pure domain layer with evidence-returning `evaluateMatch` (one function serves M4, the checklist and the M5 re-check), dates as strings + integer day maths, insert-only seeding, partial unique index for duplicate pending requests, unique `bookings.groupId` as the double-click guard, and the golden tests — the numbers in them are correct.
