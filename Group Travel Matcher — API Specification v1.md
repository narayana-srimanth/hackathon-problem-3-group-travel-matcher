# Group Travel Matcher — API Specification v1

Nov 13, 2026 · @narp

The single source of truth for every request and response between the React client and the Express backend. Both developers build against this document; any change is made here first.

## 1. Conventions

All endpoints are JSON over HTTP under `/api/v1`, identified by one header, with camelCase fields, ISO dates and INR amounts.

| Topic | Rule |
| --- | --- |
| Base URL | `http://localhost:4000/api/v1` (the client uses the relative `/api/v1` through the Vite proxy) |
| Identity | Header `X-Traveller-Id: <travellerId>` on every endpoint marked **Auth: traveller**. Missing or unknown → `401 UNAUTHENTICATED`. There are no passwords or tokens (M1: "a basic identity tied to a name or active session is sufficient"). |
| Roles | Derived on the server for every call: **owner** = `group.ownerId === actor`; **member** = `actor ∈ group.memberIds`; **search owner** = `search.travellerId === actor` |
| Content type | Request and response `application/json; charset=utf-8`. Requests with a body must send `Content-Type: application/json`. |
| Field names | camelCase. Unknown body fields → `400 VALIDATION_ERROR` (strict schemas). |
| IDs | Stable strings: `T-001`, `G-01`, `S-1001`, `JR-1001`, `OPT-1001`, `BK-2027-000001`, `HTL-KYO-001`, `RM-KYO-001-A`. Treat them as opaque. |
| Dates | `YYYY-MM-DD` (the destination's local date). Stays are `[checkIn, checkOut)`: `checkOut` is not a night. Valid window: `2027-04-01 ≤ checkIn < checkOut ≤ 2027-04-20`. |
| Timestamps | ISO 8601 UTC, e.g. `2026-11-13T09:15:00.000Z` (`createdAt`, `decidedAt`) |
| Money | INR. `*Inr` fields are integers, except `perMemberInr`, a number rounded to 2 decimals (e.g. `15866.67`). |
| Cities | Exactly one of `Tokyo`, `Kyoto`, `Osaka`, `Dubai`, `Abu Dhabi` (case-sensitive; take the list from `GET /meta/destinations`) |
| Enums | `Gender`: `FEMALE`, `MALE`. `GenderPreference`: `ANY`, `SAME_GENDER`. Interest IDs come from `GET /meta/interests`. |
| Pagination | List endpoints take `?page=1&limit=20` (`limit` ≤ 50) and return `{ items, page, limit, total }` |
| Success codes | `200` read or action, `201` created (the body contains the created resource) |
| Mutations | Every mutation returns the changed resource(s); the client never re-derives server state |
| Ordering | Every list has a deterministic order, stated per endpoint |
| Versioning | Path version `/v1`. Breaking changes go to `/v2`; adding a field is not breaking (clients must ignore unknown fields). |

**Notation used below.** ✱ = required. Types: `string`, `int`, `number`, `bool`, `ISODate`, `Enum`, `T[]`. "→" means "returns".

## 2. Endpoint index

The API has 29 operations. Every Must-have feature (M1–M6) maps to the operations below.

| ID | Method | Path | Auth | Role | Feature | Spec |
| --- | --- | --- | --- | --- | --- | --- |
| E01 | GET | `/health` | none | – | ops | §5 |
| E02 | GET | `/meta/interests` | none | – | M1, M3 | §5 |
| E03 | GET | `/meta/destinations` | none | – | M2, M3 | §5 |
| E04 | POST | `/travellers` | none | – | M1 | §5 |
| E05 | GET | `/travellers` | none | – | M1 (Continue as) | §5 |
| E06 | GET | `/travellers/:travellerId` | traveller | any | M1, G2 | §5 |
| E07 | GET | `/me` | traveller | self | M1 | §5 |
| E08 | POST | `/groups` | traveller | any (becomes owner) | M2 | §6 |
| E09 | GET | `/groups/:groupId` | traveller | any | M2, M4, M5 | §6 |
| E10 | GET | `/me/groups` | traveller | self | M2, M5 badge | §6 |
| E11 | POST | `/searches` | traveller | any | M3, M4 | §7 |
| E12 | GET | `/searches/:searchId` | traveller | search owner | M3 (refresh) | §7 |
| E13 | GET | `/searches/:searchId/matches` | traveller | search owner | M4 | §7 |
| E14 | GET | `/searches/:searchId/groups/:groupId/evaluation` | traveller | search owner | M4 | §7 |
| E15 | POST | `/groups/:groupId/join-requests` | traveller | not owner, not member | M5 | §8 |
| E16 | GET | `/groups/:groupId/join-requests` | traveller | owner | M5 | §8 |
| E17 | GET | `/me/join-requests` | traveller | self | M5 | §8 |
| E18 | POST | `/join-requests/:requestId/approve` | traveller | owner | M5 | §8 |
| E19 | POST | `/join-requests/:requestId/reject` | traveller | owner | M5 | §8 |
| E20 | POST | `/join-requests/:requestId/withdraw` | traveller | seeker | M5 | §8 |
| E21 | GET | `/groups/:groupId/hotels` | traveller | member | M6 | §9 |
| E22 | POST | `/groups/:groupId/saved-options` | traveller | member | M6 | §9 |
| E23 | GET | `/groups/:groupId/saved-options` | traveller | member | M6 | §9 |
| E24 | DELETE | `/groups/:groupId/saved-options/:optionId` | traveller | saver or owner | M6 | §9 |
| E25 | POST | `/groups/:groupId/saved-options/:optionId/vote` | traveller | member | M6 | §9 |
| E26 | DELETE | `/groups/:groupId/saved-options/:optionId/vote` | traveller | member | M6 | §9 |
| E27 | POST | `/groups/:groupId/booking/quote` | traveller | member | M6 | §9 |
| E28 | POST | `/groups/:groupId/booking` | traveller | member | M6 | §9 |
| E29 | GET | `/groups/:groupId/booking` | traveller | member | M6 | §9 |

Static files: `GET /static/hotels/<file>.jpg` serves the pack's `images/hotels/` folder (no auth). `Hotel.image` is already this path.

### 2.1 Path parameters

| Parameter | Format | Example | Unknown value |
| --- | --- | --- | --- |
| `:travellerId` | `T-` + digits | `T-001`, `T-1001` | 404 |
| `:groupId` | `G-` + digits | `G-01`, `G-1001` | 404 |
| `:searchId` | `S-` + digits | `S-1001` | 404 |
| `:requestId` | `JR-` + digits | `JR-1001` | 404 |
| `:optionId` | `OPT-` + digits | `OPT-1001` | 404 |

A malformed ID (e.g. `G-abc`) is treated the same as an unknown one: `404 NOT_FOUND`.

### 2.2 Request and response matrix

One row per operation: everything a client needs to call it and everything it can get back. Detailed field rules and examples are in §5–§9.

| ID | Method + path | Path params | Query params | Request body | Success | Error statuses |
| --- | --- | --- | --- | --- | --- | --- |
| E01 | `GET /health` | – | – | – | `200 { status, db, time }` | 503 |
| E02 | `GET /meta/interests` | – | – | – | `200 { items: Interest[] }` | 500 |
| E03 | `GET /meta/destinations` | – | – | – | `200 Destinations` | 500 |
| E04 | `POST /travellers` | – | – | `name`✱, `gender`✱, `homeCity`✱, `interests`✱, `genderPreference`✱, `age` | `201 { traveller: Traveller }` | 400 |
| E05 | `GET /travellers` | – | `query`, `page`, `limit` | – | `200 Page<TravellerSummary>` | 400 |
| E06 | `GET /travellers/:travellerId` | `travellerId` | – | – | `200 { traveller, groups[] }` | 401, 404 |
| E07 | `GET /me` | – | – | – | `200 { traveller: Traveller }` | 401 |
| E08 | `POST /groups` | – | – | `name`✱, `city`✱, `checkIn`✱, `checkOut`✱, `maxSize`✱, `budgetInr`✱, `itinerary` | `201 { group: Group }` | 400, 401, 422 |
| E09 | `GET /groups/:groupId` | `groupId` | – | – | `200 { group: Group }` | 401, 404 |
| E10 | `GET /me/groups` | – | – | – | `200 { owned: Group[], memberOf: Group[], totalPendingRequests }` | 401 |
| E11 | `POST /searches` | – | – | `homeCity`✱, `city`✱, `checkIn`✱, `checkOut`✱, `interests`✱, `budgetInr`✱, `genderPreference`✱, `limit` | `201 { search, matches: Page<MatchCard>, emptyStateHints }` | 400, 401, 422 |
| E12 | `GET /searches/:searchId` | `searchId` | – | – | `200 { search: Search }` | 401, 403, 404 |
| E13 | `GET /searches/:searchId/matches` | `searchId` | `page`, `limit`, `sharedInterest`, `genderComposition` | – | `200 { matches: Page<MatchCard>, emptyStateHints }` | 400, 401, 403, 404 |
| E14 | `GET /searches/:searchId/groups/:groupId/evaluation` | `searchId`, `groupId` | – | – | `200 Evaluation` | 401, 403, 404 |
| E15 | `POST /groups/:groupId/join-requests` | `groupId` | – | `searchId`✱, `message` | `201 { request: JoinRequest, group: Group }` | 400, 401, 403, 404, 409, 422 |
| E16 | `GET /groups/:groupId/join-requests` | `groupId` | `status`, `page`, `limit` | – | `200 Page<{ request, seeker }>` | 400, 401, 403, 404 |
| E17 | `GET /me/join-requests` | – | `status`, `page`, `limit` | – | `200 Page<{ request, group }>` | 400, 401 |
| E18 | `POST /join-requests/:requestId/approve` | `requestId` | – | – | `200 { request, group, closedRequestIds, closedSeekerRequestIds }` | 401, 403, 404, 409 |
| E19 | `POST /join-requests/:requestId/reject` | `requestId` | – | – | `200 { request: JoinRequest }` | 401, 403, 404, 409 |
| E20 | `POST /join-requests/:requestId/withdraw` | `requestId` | – | – | `200 { request: JoinRequest }` | 401, 403, 404, 409 |
| E21 | `GET /groups/:groupId/hotels` | `groupId` | `sort`, `minStars`, `minRating`, `maxPerMemberInr`, `roomType`, `planFor`, `page`, `limit` | – | `200 { context, page, limit, total, items[] }` | 400, 401, 403, 404 |
| E22 | `POST /groups/:groupId/saved-options` | `groupId` | – | `roomId`✱ | `201 { option: SavedOption }` | 400, 401, 403, 404, 409, 422 |
| E23 | `GET /groups/:groupId/saved-options` | `groupId` | – | – | `200 { items: SavedOption[] }` | 401, 403, 404 |
| E24 | `DELETE /groups/:groupId/saved-options/:optionId` | `groupId`, `optionId` | – | – | `200 { deleted }` | 401, 403, 404, 409 |
| E25 | `POST /groups/:groupId/saved-options/:optionId/vote` | `groupId`, `optionId` | – | – | `200 { option: SavedOption }` | 401, 403, 404, 409 |
| E26 | `DELETE /groups/:groupId/saved-options/:optionId/vote` | `groupId`, `optionId` | – | – | `200 { option: SavedOption }` | 401, 403, 404, 409 |
| E27 | `POST /groups/:groupId/booking/quote` | `groupId` | – | `optionId`✱ | `200 BookingQuote` | 400, 401, 403, 404, 409 |
| E28 | `POST /groups/:groupId/booking` | `groupId` | – | `optionId`✱ | `201 { booking: Booking, group: Group }` | 400, 401, 403, 404, 409, 422 |
| E29 | `GET /groups/:groupId/booking` | `groupId` | – | – | `200 { booking: Booking }` | 401, 403, 404 |

Every endpoint can also return `500 INTERNAL`. All operations except E01–E05 require the `X-Traveller-Id` header.

## 3. Error model

Every non-2xx response has the same envelope. The client switches on `error.code`, never on the message text.

```json
{ "error": {
    "code": "VALIDATION_ERROR",
    "message": "checkOut must be after checkIn",
    "details": [ { "field": "checkOut", "issue": "must be after checkIn" } ],
    "requestId": "req_8f2c1a" } }
```

- `details` is always an array (it may be empty). For `NOT_ELIGIBLE` each entry is `{ "rule": "<RuleId>", "issue": "<human text>" }`.
- `requestId` is also sent as the `X-Request-Id` response header and logged on the server.

| HTTP | `code` | Meaning | Typical endpoints |
| --- | --- | --- | --- |
| 400 | `VALIDATION_ERROR` | Wrong type, missing ✱ field, bad enum, impossible date (`2027-04-31`), `checkOut ≤ checkIn`, unknown field | E04, E08, E11, E15 |
| 401 | `UNAUTHENTICATED` | `X-Traveller-Id` missing or not an existing traveller | all with Auth: traveller |
| 403 | `FORBIDDEN` | Authenticated but not allowed (not owner, not member, not search owner) | E12–E14, E16, E18–E29 |
| 404 | `NOT_FOUND` | Unknown group, search, request, option, room or booking | all with path IDs |
| 409 | `OWN_GROUP` | Seeker is the group's owner | E15 |
| 409 | `ALREADY_MEMBER` | Seeker is already in the group | E15 |
| 409 | `DUPLICATE_REQUEST` | A PENDING request for this group and seeker already exists | E15 |
| 409 | `GROUP_FULL` | No free place (at request time, or taken before approval) | E15, E18 |
| 409 | `GROUP_CLOSED` | Group is BOOKED | E15, E18, E22, E28 |
| 409 | `REQUEST_NOT_PENDING` | Approve, reject or withdraw on a request that is no longer PENDING | E18–E20 |
| 409 | `DATES_CONFLICT` | The seeker is already a member of another group whose stay shares at least one night with this one (any city). `details[0]` is `{ "groupId", "issue" }` naming that group. Back-to-back stays don't conflict. | E15, E18 |
| 409 | `CONFLICT` | Another change is in progress (retry): an approval of the same traveller (E18), a member joining while the group books (E28), or an unexpected duplicate | E18, E28, any |
| 409 | `ALREADY_SAVED` | That room is already a saved option for the group | E22 |
| 409 | `ALREADY_BOOKED` | The group already has a booking | E27, E28 |
| 422 | `OUT_OF_DATA_RANGE` | City not one of the 5, or dates outside 1–20 Apr 2027. The message names the allowed values. | E08, E11 |
| 422 | `NOT_ELIGIBLE` | The seeker's search fails at least one matching rule for this group; `details` lists the failing rules | E15 |
| 422 | `ROOMS_UNAVAILABLE` | The room doesn't have enough rooms left on every night of the stay. `details[0].date` is the first night that fails. | E22, E27, E28 |
| 500 | `INTERNAL` | Unexpected error; quote the `requestId` | any |

**Example 422 `OUT_OF_DATA_RANGE`**

```json
{ "error": { "code": "OUT_OF_DATA_RANGE",
  "message": "We only have data for Tokyo, Kyoto, Osaka, Dubai and Abu Dhabi between 1 and 20 April 2027.",
  "details": [ { "field": "city", "issue": "'Bangkok' is not available" } ], "requestId": "req_19ab02" } }
```

**Example 422 `NOT_ELIGIBLE`**

```json
{ "error": { "code": "NOT_ELIGIBLE", "message": "You don't match this group.",
  "details": [ { "rule": "GENDER", "issue": "The group owner is male and your preference is female only" } ],
  "requestId": "req_77c0e1" } }
```

## 4. Schemas

These are the reusable response objects. Endpoint sections refer to them by name. They're written as TypeScript, so the frontend can paste them into `api/types.ts` and the backend can mirror them in its DTO mappers.

```ts
type ISODate = string;                 // 'YYYY-MM-DD'
type Gender = 'FEMALE' | 'MALE';
type GenderPreference = 'ANY' | 'SAME_GENDER';
type Page<T> = { items: T[]; page: number; limit: number; total: number };

// ---- Meta ----
interface Interest     { interest: string; label: string; category: 'CULTURE'|'FOOD'|'SOCIAL'|'HOBBY'|'NATURE'|'ACTIVITY'|'STYLE' }
interface City         { name: string; country: string; countryCode: string; timezone: string }
interface Destinations { cities: City[]; departureCities: { city: string; airport: string }[]; dataWindow: { from: ISODate; to: ISODate } }

// ---- Travellers ----
interface Traveller {
  travellerId: string; name: string; age: number | null; gender: Gender;
  homeCity: string; homeAirport: string; interests: string[]; genderPreference: GenderPreference; createdAt: string;
}
type TravellerSummary = Pick<Traveller, 'travellerId' | 'name' | 'gender' | 'homeCity'>;

// ---- Groups ----
type GroupStatus = 'OPEN' | 'FULL' | 'BOOKED';
type ViewerRelation = 'OWNER' | 'MEMBER' | 'PENDING' | 'REJECTED' | 'NONE';
interface Group {
  groupId: string; name: string; city: string; country: string; timezone: string;
  checkIn: ISODate; checkOut: ISODate; nights: number;
  maxSize: number; memberCount: number; freeSpots: number;          // freeSpots = maxSize - memberCount
  budgetInr: number; itinerary: string; status: GroupStatus;
  owner: { travellerId: string; name: string; gender: Gender };
  members: (TravellerSummary & { isOwner: boolean })[];            // owner first, then by join time
  viewer: { relation: ViewerRelation; requestId: string | null; pendingRequestCount: number | null }; // count: owner only
  createdAt: string;
}

// ---- Search & matching ----
type RuleId = 'SAME_CITY' | 'DATES_OVERLAP' | 'BUDGET' | 'SHARED_INTERESTS' | 'GENDER' | 'GROUP_SIZE';
interface Search {
  searchId: string; travellerId: string; homeCity: string; city: string; checkIn: ISODate; checkOut: ISODate; nights: number;
  interests: string[]; budgetInr: number; gender: Gender; genderPreference: GenderPreference; createdAt: string;
}
interface MatchReasons {
  sharedNights: number; sharedFrom: ISODate; sharedTo: ISODate;   // sharedTo = day after the last shared night
  sharedInterests: string[]; budgetDiffInr: number; budgetLimitInr: number;
  gender: string;                                               // e.g. 'Female only ↔ female only'
  spotsAfterJoin: number;
}
interface MatchCard {
  groupId: string; name: string; city: string; checkIn: ISODate; checkOut: ISODate;
  memberCount: number; maxSize: number; freeSpots: number; budgetInr: number;
  owner: { travellerId: string; name: string };
  score: number;                                                // 0–100, see the ranking in the backend doc §4.4
  reasons: MatchReasons;
  viewerRequestStatus: RequestStatus | null;
}
interface RuleCheck {
  rule: RuleId; passed: boolean;
  // evidence, present depending on the rule:
  sharedNights?: number; diffInr?: number; limitInr?: number; shared?: string[]; freeAfterJoin?: number;
  message: string;                                              // human sentence, e.g. '5 shared nights (10–15 Apr)'
}
interface Evaluation { eligible: boolean; checks: RuleCheck[]; failed: RuleId[] }   // checks always has 6 entries, fixed order
interface EmptyHint  { type: 'WIDEN_DATES' | 'ADJUST_BUDGET' | 'ADD_INTERESTS' | 'OTHER_CITY'; message: string; groupId?: string }

// ---- Join requests ----
type RequestStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'WITHDRAWN' | 'CLOSED';
interface JoinRequest {
  requestId: string; groupId: string; seekerId: string; searchId: string; status: RequestStatus; message: string | null;
  matchSnapshot: { sharedNights: number; sharedInterests: string[]; budgetDiffInr: number; score: number };
  createdAt: string; decidedAt: string | null; decidedBy: string | null;
}

// ---- Hotels, options, booking ----
interface Hotel { hotelId: string; name: string; city: string; area: string; stars: number; rating: number; image: string; checkInFrom: string; checkOutUntil: string }
interface Room  { roomId: string; roomType: 'SINGLE'|'TWIN'|'DOUBLE'|'TRIPLE'|'FAMILY'|'FAMILY_SUITE'; name: string; maxAdults: number; pricePerNightInr: number; refundable: boolean }
interface RoomOption extends Room {
  roomsNeeded: number; nights: number; totalInr: number;
  perMemberInr: number;                                          // round2(totalInr / partySize)
  budgetSharePct: number;                                        // round1(perMemberInr / group.budgetInr * 100)
  minRoomsLeft: number; savedOptionId: string | null;
}
interface SavedOption {
  optionId: string; groupId: string; hotel: Hotel; room: Room; savedBy: string; createdAt: string;
  votes: string[]; voteCount: number; memberCount: number; allAgree: boolean;   // allAgree = voteCount === memberCount
  snapshot: { memberCount: number; roomsNeeded: number; totalInr: number; perMemberInr: number };
  live:     { roomsNeeded: number; totalInr: number; perMemberInr: number; available: boolean };
  stale: boolean;                                                // snapshot.memberCount !== current memberCount
}
interface Booking {
  bookingId: string; groupId: string; optionId: string; hotel: Hotel; room: Room;
  roomsBooked: number; nights: ISODate[]; memberIds: string[];
  totalInr: number; perMemberInr: number; status: 'CONFIRMED'; bookedBy: string; createdAt: string;
}
```

```ts
// Returned by E27 (booking quote), shown in the confirmation popup
interface BookingQuote {
  optionId: string; hotelName: string; roomName: string; checkIn: ISODate; checkOut: ISODate;
  nights: number; roomsNeeded: number; memberCount: number; pricePerNightInr: number;
  totalInr: number; perMemberInr: number; available: boolean;
  members: { travellerId: string; name: string }[];
}
```

**Invariants the client can rely on**

- `Group.freeSpots === Group.maxSize - Group.memberCount`, and `status === 'FULL'` exactly when `freeSpots === 0` (unless the group is BOOKED).
- A traveller who joins through a join request is never a member of two groups whose stays share a night. Back-to-back stays (one checks out on the day the other checks in) are allowed.
- `Evaluation.checks` always lists the 6 rules in the order `SAME_CITY, DATES_OVERLAP, BUDGET, SHARED_INTERESTS, GENDER, GROUP_SIZE`.
- `RoomOption.totalInr === pricePerNightInr × roomsNeeded × nights`, and `roomsNeeded === ceil(partySize / maxAdults)`.
- Every money value is calculated on the server; the client only formats it.

## 5. Meta and Travellers (M1)

The meta endpoints feed every dropdown, so nothing is hard-coded in the client. The traveller endpoints give the no-password identity that M1 asks for.

### E01 · GET /health

Auth: none. → `200 { "status": "ok", "db": "up", "time": "2026-11-13T09:15:00.000Z" }`. If Mongo is unreachable → `503 { "status": "degraded", "db": "down" }`.

### E02 · GET /meta/interests

Auth: none. → `200 { "items": Interest[] }` (16 items, in file order). Cacheable; the client sets `staleTime: Infinity`.

```json
{ "items": [ { "interest": "TEMPLES", "label": "Temples and shrines", "category": "CULTURE" } ] }
```

### E03 · GET /meta/destinations

Auth: none. → `200 Destinations`. The cities come in catalog order (Japan first), and the departure cities feed the sign-up home-city dropdown.

```json
{ "cities": [ { "name": "Kyoto", "country": "Japan", "countryCode": "JP", "timezone": "Asia/Tokyo" } ],
  "departureCities": [ { "city": "Bengaluru", "airport": "BLR" }, { "city": "Mumbai", "airport": "BOM" } ],
  "dataWindow": { "from": "2027-04-01", "to": "2027-04-20" } }
```

### E04 · POST /travellers (sign up)

Auth: none.

| Field | Type | Rules |
| --- | --- | --- |
| `name` ✱ | string | trimmed, 2–60 chars |
| `gender` ✱ | Gender | `FEMALE` or `MALE` |
| `homeCity` ✱ | string | one of `departureCities[].city` |
| `interests` ✱ | string\[\] | 1–16 items, each a valid interest ID; duplicates removed |
| `genderPreference` ✱ | GenderPreference | `ANY` or `SAME_GENDER` |
| `age` | int | 18–99; optional |

```json
{ "name": "Priya Nair", "age": 26, "gender": "FEMALE", "homeCity": "Mumbai",
  "interests": ["TEMPLES", "STREET_FOOD", "ADVENTURE"], "genderPreference": "SAME_GENDER" }
```

→ `201 { "traveller": Traveller }`. `homeAirport` is derived on the server (Mumbai → `BOM`) and `travellerId` is generated (`T-1001`, then `T-1002`, …).

Errors: `400 VALIDATION_ERROR`. Side effect: the client stores `traveller.travellerId` in `localStorage` and sends it as `X-Traveller-Id` from now on.

### E05 · GET /travellers

Auth: none. Query: `query` (optional, a case-insensitive substring of `name`), `page`, `limit`. → `200 Page<TravellerSummary>`, sorted by `travellerId`. Used by the Welcome screen's "Continue as…" picker (seeded personas: Sarah `T-001`, and so on).

Request: `GET /api/v1/travellers?query=sar&page=1&limit=20` → `200`

```json
{ "items": [ { "travellerId": "T-001", "name": "Sarah Thomas", "gender": "FEMALE", "homeCity": "Bengaluru" } ],
  "page": 1, "limit": 20, "total": 1 }
```

Errors: `400 VALIDATION_ERROR` (`page` < 1, `limit` > 50, or not an integer).

### E06 · GET /travellers/:travellerId

Auth: traveller. → `200 { "traveller": Traveller, "groups": [ { "groupId", "name", "city", "checkIn", "checkOut", "role": "OWNER" | "MEMBER" } ] }`. The `groups` list is what G2 profile pages need; for the Must-haves it can be empty. Pending requests are never listed. Errors: `401`, `404`.

Request: `GET /api/v1/travellers/T-001` with `X-Traveller-Id: T-1001` → `200`

```json
{ "traveller": { "travellerId": "T-001", "name": "Sarah Thomas", "age": 27, "gender": "FEMALE", "homeCity": "Bengaluru",
                 "homeAirport": "BLR", "interests": ["TEMPLES", "STREET_FOOD", "PHOTOGRAPHY", "BUDGET_STAYS"],
                 "genderPreference": "SAME_GENDER", "createdAt": "…" },
  "groups": [ { "groupId": "G-01", "name": "Kyoto Spring Temples", "city": "Kyoto", "checkIn": "2027-04-10", "checkOut": "2027-04-15", "role": "OWNER" } ] }
```

### E07 · GET /me

Auth: traveller. → `200 { "traveller": Traveller }`. The client calls it on app load to restore the session. A `401` means the stored ID no longer exists (for example after `npm run reset`): clear `localStorage` and go to the Welcome screen.

Request: `GET /api/v1/me` with `X-Traveller-Id: T-1001` → `200`

```json
{ "traveller": { "travellerId": "T-1001", "name": "Priya Nair", "age": 26, "gender": "FEMALE", "homeCity": "Mumbai", "homeAirport": "BOM",
                 "interests": ["TEMPLES", "STREET_FOOD", "ADVENTURE"], "genderPreference": "SAME_GENDER", "createdAt": "…" } }
```

Errors: `401 UNAUTHENTICATED` (header missing, or the ID doesn't exist).

## 6. Groups (M2)

The creator becomes the owner and the first member. Everything about a group's state (members, free places, status, the viewer's relation) comes back in one `Group` object.

### E08 · POST /groups (create a group post)

Auth: traveller (the actor becomes the owner).

| Field | Type | Rules |
| --- | --- | --- |
| `name` ✱ | string | trimmed, 3–80 chars |
| `city` ✱ | string | one of the 5 cities, otherwise `422 OUT_OF_DATA_RANGE` |
| `checkIn` ✱ | ISODate | valid date, ≥ `2027-04-01`, otherwise 422 |
| `checkOut` ✱ | ISODate | > `checkIn` (400 otherwise), ≤ `2027-04-20` (422 otherwise) |
| `maxSize` ✱ | int | 1–4, **total people including the owner** |
| `budgetInr` ✱ | int | 1,000–10,000,000, approximate budget per person |
| `itinerary` | string | 0–2,000 chars; default `""` |

```json
{ "name": "Kyoto Spring Temples", "city": "Kyoto", "checkIn": "2027-04-10", "checkOut": "2027-04-15",
  "maxSize": 3, "budgetInr": 60000, "itinerary": "Fushimi Inari at sunrise, Nishiki Market lunch, Gion walk." }
```

→ `201 { "group": Group }`, with `ownerId` = actor, `members` = \[actor\], `memberCount: 1`, `status: "OPEN"` (or `"FULL"` when `maxSize` is 1), `viewer.relation: "OWNER"`, `viewer.pendingRequestCount: 0`.

Errors: `400 VALIDATION_ERROR`, `401`, `422 OUT_OF_DATA_RANGE`. The owner's gender, gender preference and interests used for matching come from the owner's profile. They are not fields here.

### E09 · GET /groups/:groupId

Auth: traveller (anyone signed in can view a group post). → `200 { "group": Group }`.

```json
{ "group": {
  "groupId": "G-01", "name": "Kyoto Spring Temples", "city": "Kyoto", "country": "Japan", "timezone": "Asia/Tokyo",
  "checkIn": "2027-04-10", "checkOut": "2027-04-15", "nights": 5, "maxSize": 3, "memberCount": 1, "freeSpots": 2,
  "budgetInr": 60000, "itinerary": "Fushimi Inari at sunrise, …", "status": "OPEN",
  "owner": { "travellerId": "T-001", "name": "Sarah Thomas", "gender": "FEMALE" },
  "members": [ { "travellerId": "T-001", "name": "Sarah Thomas", "gender": "FEMALE", "homeCity": "Bengaluru", "isOwner": true } ],
  "viewer": { "relation": "PENDING", "requestId": "JR-1001", "pendingRequestCount": null },
  "createdAt": "2026-11-13T09:00:00.000Z" } }
```

`viewer` is computed for the caller: `OWNER`, `MEMBER`, `PENDING` (with `requestId`), `REJECTED` (the latest request was rejected; may request again), or `NONE`. `pendingRequestCount` is a number only for the owner. Errors: `401`, `404`.

### E10 · GET /me/groups

Auth: traveller. → `200 { "owned": Group[], "memberOf": Group[], "totalPendingRequests": int }`. `owned` holds groups where the caller is owner. `memberOf` holds groups where they are a member but not the owner. Both are sorted by `checkIn` ascending. `totalPendingRequests` is the sum of PENDING requests across owned groups, and drives the creator's notification badge (brief FAQ). The client polls it every 15 s.

Request: `GET /api/v1/me/groups` with `X-Traveller-Id: T-001` → `200`

```json
{ "owned": [ { "groupId": "G-01", "name": "Kyoto Spring Temples", "city": "Kyoto", "checkIn": "2027-04-10", "checkOut": "2027-04-15",
               "memberCount": 1, "maxSize": 3, "freeSpots": 2, "status": "OPEN",
               "viewer": { "relation": "OWNER", "requestId": null, "pendingRequestCount": 1 }, "...": "other Group fields" } ],
  "memberOf": [],
  "totalPendingRequests": 1 }
```

Errors: `401 UNAUTHENTICATED`.

## 7. Searches and matches (M3, M4)

A search is stored, then matched **live** against every OPEN group in the same city. A group is returned only if all 6 rules pass. Results are never cached, so a group that fills up drops out on the next read.

**The 6 rules (all must pass).** Thresholds are server constants. The search provides the dates, budget, interests and gender preference; the seeker's gender comes from their profile. Each group is checked against its own dates, budget, size and members, and against its **owner's** gender, preference and interests.

| RuleId | Passes when |
| --- | --- |
| `SAME_CITY` | `search.city === group.city` |
| `DATES_OVERLAP` | shared nights `= max(0, min(out₁,out₂) − max(in₁,in₂))` ≥ **2** |
| `BUDGET` | \` |
| `SHARED_INTERESTS` | \` |
| `GENDER` | seeker's preference allows the owner's gender **and** the owner's preference allows the seeker's gender (`ANY` allows all; `SAME_GENDER` requires equal genders) |
| `GROUP_SIZE` | `memberCount + 1 ≤ maxSize` |

Groups are also left out (pre-filters, not rules) when `status ≠ OPEN`, the seeker is the owner or a member, or the group's stay shares a night with a group the seeker has already joined (a traveller is in at most one group per night).

### E11 · POST /searches (search and get the first page of matches)

Auth: traveller.

| Field | Type | Rules |
| --- | --- | --- |
| `homeCity` ✱ | string | one of `departureCities[].city` |
| `city` ✱ | string | one of the 5 cities, otherwise `422 OUT_OF_DATA_RANGE` |
| `checkIn` ✱, `checkOut` ✱ | ISODate | same rules as E08 |
| `interests` ✱ | string\[\] | 1–16 valid IDs (the client pre-fills them from the profile) |
| `budgetInr` ✱ | int | 1,000–10,000,000 |
| `genderPreference` ✱ | GenderPreference | the client pre-fills it from the profile |
| `limit` | int | page size of the embedded results; default 20, max 50 |

`gender` is **not** accepted. It is copied from the caller's profile.

```json
{ "homeCity": "Mumbai", "city": "Kyoto", "checkIn": "2027-04-09", "checkOut": "2027-04-16",
  "interests": ["TEMPLES", "STREET_FOOD", "ADVENTURE"], "budgetInr": 62000, "genderPreference": "SAME_GENDER" }
```

→ `201 { "search": Search, "matches": Page<MatchCard>, "emptyStateHints": EmptyHint[] }`

```json
{ "search": { "searchId": "S-1001", "travellerId": "T-1001", "city": "Kyoto", "checkIn": "2027-04-09", "checkOut": "2027-04-16",
              "nights": 7, "interests": ["TEMPLES", "STREET_FOOD", "ADVENTURE"], "budgetInr": 62000,
              "gender": "FEMALE", "genderPreference": "SAME_GENDER", "homeCity": "Mumbai", "createdAt": "…" },
  "matches": { "page": 1, "limit": 20, "total": 2, "items": [
    { "groupId": "G-01", "name": "Kyoto Spring Temples", "city": "Kyoto", "checkIn": "2027-04-10", "checkOut": "2027-04-15",
      "memberCount": 1, "maxSize": 3, "freeSpots": 2, "budgetInr": 60000,
      "owner": { "travellerId": "T-001", "name": "Sarah Thomas" }, "score": 63,
      "reasons": { "sharedNights": 5, "sharedFrom": "2027-04-10", "sharedTo": "2027-04-15",
                   "sharedInterests": ["TEMPLES", "STREET_FOOD"], "budgetDiffInr": 2000, "budgetLimitInr": 24000,
                   "gender": "Female only ↔ female only", "spotsAfterJoin": 1 },
      "viewerRequestStatus": null },
    { "groupId": "G-08", "name": "Kyoto Night Food Trail", "checkIn": "2027-04-10", "checkOut": "2027-04-14", "score": 58, "...": "..." } ] },
  "emptyStateHints": [] }
```

**Order:** `score` ↓, then shared-interest count ↓, shared nights ↓, `checkIn` ↑, `groupId` ↑ (deterministic). **Empty results:** `total: 0` and `emptyStateHints` built from groups that fail exactly one rule, e.g. `{ "type": "WIDEN_DATES", "groupId": "G-02", "message": "Kyoto Late Bloom shares only 1 night; a check-out of 17 Apr would share 2." }`. A 1-night search always gets the hint "Stay at least 2 nights to match a group."

Errors: `400`, `401`, `422 OUT_OF_DATA_RANGE`.

### E12 · GET /searches/:searchId

Auth: search owner. → `200 { "search": Search }`. It restores the search form and the results header after a refresh. Errors: `401`, `403`, `404`.

Request: `GET /api/v1/searches/S-1001` with `X-Traveller-Id: T-1001` → `200`

```json
{ "search": { "searchId": "S-1001", "travellerId": "T-1001", "homeCity": "Mumbai", "city": "Kyoto",
              "checkIn": "2027-04-09", "checkOut": "2027-04-16", "nights": 7,
              "interests": ["TEMPLES", "STREET_FOOD", "ADVENTURE"], "budgetInr": 62000,
              "gender": "FEMALE", "genderPreference": "SAME_GENDER", "createdAt": "…" } }
```

### E13 · GET /searches/:searchId/matches

Auth: search owner. Query: `page`, `limit`, plus G1 filters (optional, applied **after** the 6 rules, so they can only narrow the results): `sharedInterest=<interest ID>` (repeatable) and `genderComposition=ALL_FEMALE|ALL_MALE|MIXED` (based on the current members). → `200 { "matches": Page<MatchCard>, "emptyStateHints": EmptyHint[] }`, re-evaluated on current data. Errors: `401`, `403`, `404`.

Request: `GET /api/v1/searches/S-1001/matches?page=1&limit=20&sharedInterest=TEMPLES&genderComposition=ALL_FEMALE` → `200`

```json
{ "matches": { "page": 1, "limit": 20, "total": 2, "items": [
    { "groupId": "G-01", "name": "Kyoto Spring Temples", "city": "Kyoto", "checkIn": "2027-04-10", "checkOut": "2027-04-15",
      "memberCount": 1, "maxSize": 3, "freeSpots": 2, "budgetInr": 60000,
      "owner": { "travellerId": "T-001", "name": "Sarah Thomas" }, "score": 63,
      "reasons": { "sharedNights": 5, "sharedFrom": "2027-04-10", "sharedTo": "2027-04-15", "sharedInterests": ["TEMPLES", "STREET_FOOD"],
                   "budgetDiffInr": 2000, "budgetLimitInr": 24000, "gender": "Female only ↔ female only", "spotsAfterJoin": 1 },
      "viewerRequestStatus": "PENDING" } ] },
  "emptyStateHints": [] }
```

The extra errors here are `400 VALIDATION_ERROR` for an unknown `sharedInterest` ID or a `genderComposition` value outside `ALL_FEMALE | ALL_MALE | MIXED`.

### E14 · GET /searches/:searchId/groups/:groupId/evaluation

Auth: search owner. → `200 Evaluation`, the rule-by-rule result for one group, **including groups that don't match**. Used for the ✅/❌ checklist on the group detail page.

```json
{ "eligible": false, "failed": ["BUDGET"], "checks": [
  { "rule": "SAME_CITY", "passed": true, "message": "Both going to Kyoto" },
  { "rule": "DATES_OVERLAP", "passed": true, "sharedNights": 4, "message": "4 shared nights (10–14 Apr)" },
  { "rule": "BUDGET", "passed": false, "diffInr": 25000, "limitInr": 24800, "message": "Budgets differ by ₹25,000; the limit is ₹24,800" },
  { "rule": "SHARED_INTERESTS", "passed": true, "shared": ["STREET_FOOD", "TEMPLES"], "message": "2 shared interests" },
  { "rule": "GENDER", "passed": true, "message": "Female only ↔ female only" },
  { "rule": "GROUP_SIZE", "passed": true, "freeAfterJoin": 1, "message": "1 place left after you join" } ] }
```

(This is Priya's search against G-04, Kyoto Ryokan Retreat.) Errors: `401`, `403`, `404`.

## 8. Join requests (M5)

A seeker requests to join from a search. The server re-checks all 6 rules at request time, and capacity again at approval. An owner can never overfill a group, even with two approvals in parallel.

A traveller can't be in two groups on the same night. Requests to several overlapping groups are allowed, but the first approval wins: the seeker's other pending requests to overlapping groups are closed, and a later approval of one of them is refused with `409 DATES_CONFLICT`. This holds even when two owners approve the same seeker at the same moment.

**Request lifecycle**

| From | Action (endpoint) | To | Who |
| --- | --- | --- | --- |
| – | create (E15) | `PENDING` | seeker |
| `PENDING` | approve (E18) | `APPROVED`, seeker added to `members` | owner |
| `PENDING` | reject (E19) | `REJECTED` | owner |
| `PENDING` | withdraw (E20) | `WITHDRAWN` | seeker |
| `PENDING` | group became FULL or BOOKED | `CLOSED` (automatic) | system |
| `PENDING` | the seeker joined another group on overlapping nights | `CLOSED` (automatic) | system |

Every state except PENDING is final. After `REJECTED`, `WITHDRAWN` or `CLOSED`, the seeker may send a **new** request (a new `requestId`), as long as the rules still pass.

### E15 · POST /groups/:groupId/join-requests ("Interested")

Auth: traveller.

| Field | Type | Rules |
| --- | --- | --- |
| `searchId` ✱ | string | a search that belongs to the caller; it supplies the dates, budget, interests and preference for the rule check |
| `message` | string | 0–500 chars, shown to the owner |

```json
{ "searchId": "S-1001", "message": "Hi Sarah! I love temples and street food too." }
```

The server checks these in order, and the first failure is returned: group exists (`404`) → search exists (`404`) and is the caller's (`403`) → caller is not the owner (`409 OWN_GROUP`) → not a member (`409 ALREADY_MEMBER`) → group not BOOKED (`409 GROUP_CLOSED`) → not FULL (`409 GROUP_FULL`) → caller not already in another group on overlapping nights (`409 DATES_CONFLICT`) → **all 6 rules pass** (`422 NOT_ELIGIBLE` listing the failed rules) → no PENDING request already (`409 DUPLICATE_REQUEST`).

→ `201 { "request": JoinRequest, "group": Group }` (the group's `viewer.relation` is now `PENDING`)

```json
{ "request": { "requestId": "JR-1001", "groupId": "G-01", "seekerId": "T-1001", "searchId": "S-1001", "status": "PENDING",
               "message": "Hi Sarah! I love temples and street food too.",
               "matchSnapshot": { "sharedNights": 5, "sharedInterests": ["TEMPLES", "STREET_FOOD"], "budgetDiffInr": 2000, "score": 63 },
               "createdAt": "…", "decidedAt": null, "decidedBy": null },
  "group": { "groupId": "G-01", "viewer": { "relation": "PENDING", "requestId": "JR-1001", "pendingRequestCount": null }, "...": "..." } }
```

### E16 · GET /groups/:groupId/join-requests (owner inbox)

Auth: owner. Query: `status` (optional, `PENDING` by default; `ALL` for history), `page`, `limit`. → `200 Page<{ request: JoinRequest, seeker: Traveller }>`, oldest first (first come, first served). The seeker's full profile is included so the owner can decide. Errors: `401`, `403`, `404`.

Request: `GET /api/v1/groups/G-01/join-requests?status=PENDING` with `X-Traveller-Id: T-001` → `200`

```json
{ "items": [ {
    "request": { "requestId": "JR-1001", "groupId": "G-01", "seekerId": "T-1001", "searchId": "S-1001", "status": "PENDING",
                 "message": "Hi Sarah! I love temples and street food too.",
                 "matchSnapshot": { "sharedNights": 5, "sharedInterests": ["TEMPLES", "STREET_FOOD"], "budgetDiffInr": 2000, "score": 63 },
                 "createdAt": "…", "decidedAt": null, "decidedBy": null },
    "seeker": { "travellerId": "T-1001", "name": "Priya Nair", "age": 26, "gender": "FEMALE", "homeCity": "Mumbai", "homeAirport": "BOM",
                "interests": ["TEMPLES", "STREET_FOOD", "ADVENTURE"], "genderPreference": "SAME_GENDER", "createdAt": "…" } } ],
  "page": 1, "limit": 20, "total": 1 }
```

A `400 VALIDATION_ERROR` is returned for a `status` outside `PENDING | APPROVED | REJECTED | WITHDRAWN | CLOSED | ALL`.

### E17 · GET /me/join-requests

Auth: traveller. Query: `status` (optional). → `200 Page<{ request: JoinRequest, group: { groupId, name, city, checkIn, checkOut, owner: { name } } }>`, newest first. This is the seeker's "My requests" list.

Request: `GET /api/v1/me/join-requests` with `X-Traveller-Id: T-1001` → `200`

```json
{ "items": [ {
    "request": { "requestId": "JR-1001", "groupId": "G-01", "status": "PENDING", "createdAt": "…", "...": "other JoinRequest fields" },
    "group": { "groupId": "G-01", "name": "Kyoto Spring Temples", "city": "Kyoto", "checkIn": "2027-04-10", "checkOut": "2027-04-15",
               "owner": { "name": "Sarah Thomas" } } } ],
  "page": 1, "limit": 20, "total": 1 }
```

Errors: `400 VALIDATION_ERROR` (bad `status`, `page` or `limit`), `401 UNAUTHENTICATED`.

### E18 · POST /join-requests/:requestId/approve

Auth: owner of the request's group. No body.

Atomic effect: the request goes PENDING → APPROVED, and the seeker is appended to `memberIds` **only if** the group is still OPEN, has a free place, the seeker isn't already in it, and the seeker hasn't joined another group whose stay overlaps this one. If that makes the group full, the group becomes FULL and every other PENDING request becomes CLOSED. The seeker's own PENDING requests to *other* groups that overlap this stay also become CLOSED. Approvals of the same seeker run one at a time on the server, so two owners can't both add her.

→ `200 { "request": JoinRequest, "group": Group, "closedRequestIds": string[], "closedSeekerRequestIds": string[] }`

`closedRequestIds` are this group's other requests (closed because it is now full). `closedSeekerRequestIds` are the seeker's requests to other, overlapping groups (they appear as CLOSED in those owners' inboxes and in the seeker's E17 list).

```json
{ "request": { "requestId": "JR-1001", "status": "APPROVED", "decidedBy": "T-001", "decidedAt": "…", "...": "..." },
  "group": { "groupId": "G-01", "memberCount": 2, "freeSpots": 1, "status": "OPEN",
             "members": [ { "travellerId": "T-001", "name": "Sarah Thomas", "isOwner": true, "...": "..." },
                          { "travellerId": "T-1001", "name": "Priya Nair", "isOwner": false, "...": "..." } ], "...": "..." },
  "closedRequestIds": [],
  "closedSeekerRequestIds": ["JR-1004"] }
```

Errors: `401`, `403` (not the owner), `404`, `409 REQUEST_NOT_PENDING`, `409 GROUP_FULL` (the last place was taken first; this request is then CLOSED), `409 GROUP_CLOSED` (booked), `409 DATES_CONFLICT` (the seeker joined an overlapping group first; this request is then CLOSED), `409 CONFLICT` (another approval of the same seeker is in progress; retry). Approving a request that was closed automatically returns the reason (`GROUP_FULL`, `GROUP_CLOSED` or `DATES_CONFLICT`) rather than `REQUEST_NOT_PENDING`.

**Example 409 `DATES_CONFLICT`**

```json
{ "error": { "code": "DATES_CONFLICT",
  "message": "This traveller has already joined another group on overlapping nights.",
  "details": [ { "groupId": "G-01", "issue": "Already in Kyoto Spring Temples (Kyoto, 10–15 Apr)" } ],
  "requestId": "req_5d21aa" } }
```

### E19 · POST /join-requests/:requestId/reject

Auth: owner. Body: none. → `200 { "request": JoinRequest }` with `status: "REJECTED"`. Errors: `401`, `403`, `404`, `409 REQUEST_NOT_PENDING`.

Request: `POST /api/v1/join-requests/JR-1002/reject` with `X-Traveller-Id: T-001`, no body → `200`

```json
{ "request": { "requestId": "JR-1002", "groupId": "G-01", "seekerId": "T-1003", "status": "REJECTED",
               "decidedBy": "T-001", "decidedAt": "2026-11-13T10:02:00.000Z", "...": "other JoinRequest fields" } }
```

### E20 · POST /join-requests/:requestId/withdraw

Auth: the seeker who made the request. → `200 { "request": JoinRequest }` with `status: "WITHDRAWN"`. Errors: `401`, `403`, `404`, `409 REQUEST_NOT_PENDING`.

Request: `POST /api/v1/join-requests/JR-1001/withdraw` with `X-Traveller-Id: T-1001`, no body → `200`

```json
{ "request": { "requestId": "JR-1001", "groupId": "G-01", "seekerId": "T-1001", "status": "WITHDRAWN",
               "decidedBy": "T-1001", "decidedAt": "2026-11-13T10:05:00.000Z", "...": "other JoinRequest fields" } }
```

## 9. Common Group Page (M6)

Every endpoint here is **members only**. It always uses the group's own city and dates, computes every price on the server, and reads live `roomsLeft` from MongoDB. A booking reduces that availability for every other group.

**Price formula (used by every endpoint below)**

- `partySize` = current `memberCount` (or `maxSize` with `planFor=MAX`)
- `roomsNeeded = ceil(partySize / room.maxAdults)`
- `nights` = every date from `checkIn` to the day before `checkOut`
- available ⇔ `roomsLeft ≥ roomsNeeded` on **every** night
- `totalInr = pricePerNightInr × roomsNeeded × nights`
- `perMemberInr = round2(totalInr / partySize)`

Example: G-01, 2 members, Gion Corner Twin at ₹4,760: 1 room × 5 nights = ₹23,800 total, ₹11,900 each.

### E21 · GET /groups/:groupId/hotels

Auth: member.

| Query | Type | Default | Meaning |
| --- | --- | --- | --- |
| `sort` | `perMember` \| `rating` \| `stars` | `perMember` | `perMember` sorts by the cheapest option ascending; the others descending |
| `minStars` | int 1–5 | – | only hotels with at least this many stars |
| `minRating` | number 0–10 | – | only hotels with at least this rating |
| `maxPerMemberInr` | number | – | only options with `perMemberInr` ≤ this |
| `roomType` | RoomType | – | only this room type |
| `planFor` | `CURRENT` \| `MAX` | `CURRENT` | price for the current members or for a full group |
| `page`, `limit` | int | 1, 20 | pagination over hotels |

→ `200`

```json
{ "context": { "groupId": "G-01", "city": "Kyoto", "checkIn": "2027-04-10", "checkOut": "2027-04-15",
               "nights": ["2027-04-10", "2027-04-11", "2027-04-12", "2027-04-13", "2027-04-14"],
               "partySize": 2, "budgetInr": 60000, "timezone": "Asia/Tokyo" },
  "page": 1, "limit": 20, "total": 11,
  "items": [ {
    "hotel": { "hotelId": "HTL-KYO-001", "name": "Gion Corner Hotel", "city": "Kyoto", "area": "Gion", "stars": 3, "rating": 7.8,
               "image": "/static/hotels/HOTEL-BUSINESS-1.jpg", "checkInFrom": "15:00", "checkOutUntil": "11:00" },
    "cheapestPerMemberInr": 11900,
    "options": [ { "roomId": "RM-KYO-001-A", "roomType": "TWIN", "name": "Twin Room", "maxAdults": 2, "pricePerNightInr": 4760,
                   "refundable": true, "roomsNeeded": 1, "nights": 5, "totalInr": 23800, "perMemberInr": 11900,
                   "budgetSharePct": 19.8, "minRoomsLeft": 2, "savedOptionId": null } ] } ] }
```

Only available options are returned, sorted by `perMemberInr` within each hotel. Hotels with none are left out (`total` counts the hotels that have at least one). If the group is BOOKED, the response still works, so members can look, but the client hides the Save buttons. Errors: `401`, `403`, `404`.

Example request: `GET /api/v1/groups/G-01/hotels?sort=perMember&minStars=3&planFor=CURRENT&page=1&limit=20`. A `400 VALIDATION_ERROR` is returned for an unknown `sort`, `roomType` or `planFor` value, `minStars` outside 1–5, `minRating` outside 0–10, or a negative `maxPerMemberInr`.

### E22 · POST /groups/:groupId/saved-options

Auth: member. Body: `{ "roomId": "RM-KYO-001-A" }` ✱ (the room must be in a hotel in the group's city, otherwise 404). The server prices the option itself; the client never sends a price.

→ `201 { "option": SavedOption }`. The saver's vote is added automatically (`votes: [actor]`). Errors: `401`, `403`, `404`, `409 ALREADY_SAVED`, `409 GROUP_CLOSED`, `422 ROOMS_UNAVAILABLE`.

Request: `POST /api/v1/groups/G-01/saved-options` with body `{ "roomId": "RM-KYO-001-A" }` → `201`

```json
{ "option": { "optionId": "OPT-1001", "groupId": "G-01",
  "hotel": { "hotelId": "HTL-KYO-001", "name": "Gion Corner Hotel", "city": "Kyoto", "area": "Gion", "stars": 3, "rating": 7.8,
             "image": "/static/hotels/HOTEL-BUSINESS-1.jpg", "checkInFrom": "15:00", "checkOutUntil": "11:00" },
  "room": { "roomId": "RM-KYO-001-A", "roomType": "TWIN", "name": "Twin Room", "maxAdults": 2, "pricePerNightInr": 4760, "refundable": true },
  "savedBy": "T-001", "votes": ["T-001"], "voteCount": 1, "memberCount": 2, "allAgree": false,
  "snapshot": { "memberCount": 2, "roomsNeeded": 1, "totalInr": 23800, "perMemberInr": 11900 },
  "live": { "roomsNeeded": 1, "totalInr": 23800, "perMemberInr": 11900, "available": true },
  "stale": false, "createdAt": "…" } }
```

A missing or malformed `roomId` gives `400 VALIDATION_ERROR`.

### E23 · GET /groups/:groupId/saved-options

Auth: member. → `200 { "items": SavedOption[] }`, sorted by `voteCount` ↓ then `live.perMemberInr` ↑. `live` is recalculated for the current party size and current `roomsLeft`. `stale: true` when the member count has changed since saving, and `live.available: false` when it has sold out since.

```json
{ "items": [ { "optionId": "OPT-1001", "groupId": "G-01", "hotel": { "hotelId": "HTL-KYO-001", "name": "Gion Corner Hotel", "...": "..." },
  "room": { "roomId": "RM-KYO-001-A", "roomType": "TWIN", "name": "Twin Room", "maxAdults": 2, "pricePerNightInr": 4760, "refundable": true },
  "savedBy": "T-001", "votes": ["T-001", "T-1001"], "voteCount": 2, "memberCount": 2, "allAgree": true,
  "snapshot": { "memberCount": 2, "roomsNeeded": 1, "totalInr": 23800, "perMemberInr": 11900 },
  "live": { "roomsNeeded": 1, "totalInr": 23800, "perMemberInr": 11900, "available": true },
  "stale": false, "createdAt": "…" } ] }
```

Errors: `401`, `403` (not a member), `404` (unknown group).

### E24 · DELETE /groups/:groupId/saved-options/:optionId

Auth: the member who saved it, or the owner. → `200 { "deleted": "OPT-1001" }`. Errors: `401`, `403`, `404`, `409 GROUP_CLOSED` (after booking, options are frozen).

Request: `DELETE /api/v1/groups/G-01/saved-options/OPT-1001` with `X-Traveller-Id: T-001`, no body → `200 { "deleted": "OPT-1001" }`.

### E25 / E26 · POST / DELETE /groups/:groupId/saved-options/:optionId/vote

Auth: member. No body. Adds or removes the caller's vote. Both are **idempotent**: voting twice still counts once. → `200 { "option": SavedOption }`. Errors: `401`, `403`, `404`, `409 GROUP_CLOSED`.

Request: `POST /api/v1/groups/G-01/saved-options/OPT-1001/vote` with `X-Traveller-Id: T-1001`, no body → `200`

```json
{ "option": { "optionId": "OPT-1001", "votes": ["T-001", "T-1001"], "voteCount": 2, "memberCount": 2, "allAgree": true,
              "...": "other SavedOption fields" } }
```

`DELETE` on the same path returns the same shape, with the caller removed from `votes`.

### E27 · POST /groups/:groupId/booking/quote

Auth: member. Body: `{ "optionId": "OPT-1001" }` ✱. Read-only; it fills the confirmation popup with fresh numbers.

→ `200`

```json
{ "optionId": "OPT-1001", "hotelName": "Gion Corner Hotel", "roomName": "Twin Room", "checkIn": "2027-04-10", "checkOut": "2027-04-15",
  "nights": 5, "roomsNeeded": 1, "memberCount": 2, "pricePerNightInr": 4760, "totalInr": 23800, "perMemberInr": 11900,
  "available": true, "members": [ { "travellerId": "T-001", "name": "Sarah Thomas" }, { "travellerId": "T-1001", "name": "Priya Nair" } ] }
```

Errors: `401`, `403`, `404`, `409 ALREADY_BOOKED`. When `available` is `false`, the popup disables Confirm.

### E28 · POST /groups/:groupId/booking (finalise)

Auth: **any member** (brief FAQ: "any member can click Finalize Booking"). Body: `{ "optionId": "OPT-1001" }` ✱.

Atomic effect:

1. Claim the group's single booking (unique per group).
2. Reduce `roomsLeft` by `roomsNeeded` on every night, each step only if enough rooms are left. All or nothing: if any night fails, everything is undone.
3. Set the group's status to BOOKED, and set every PENDING join request to CLOSED.

→ `201 { "booking": Booking, "group": Group }`

```json
{ "booking": { "bookingId": "BK-2027-000001", "groupId": "G-01", "optionId": "OPT-1001",
               "hotel": { "hotelId": "HTL-KYO-001", "name": "Gion Corner Hotel", "...": "..." },
               "room": { "roomId": "RM-KYO-001-A", "name": "Twin Room", "...": "..." },
               "roomsBooked": 1, "nights": ["2027-04-10", "2027-04-11", "2027-04-12", "2027-04-13", "2027-04-14"],
               "memberIds": ["T-001", "T-1001"], "totalInr": 23800, "perMemberInr": 11900,
               "status": "CONFIRMED", "bookedBy": "T-1001", "createdAt": "…" },
  "group": { "groupId": "G-01", "status": "BOOKED", "...": "..." } }
```

On the server, step 3's "set BOOKED" happens right after step 1 and only if the member list is still the one that was priced; it is undone if a night fails. So no one can be approved into the group while its rooms are being reduced.

Errors: `401`, `403`, `404`, `409 ALREADY_BOOKED` (including a double-click race), `409 CONFLICT` (a member joined while booking; nothing changed, retry), `422 ROOMS_UNAVAILABLE` (nothing changed). `details[0]` is `{ "date", "roomsLeft", "roomsNeeded", "issue" }`, e.g. `{ "date": "2027-04-13", "roomsLeft": 1, "roomsNeeded": 2, "issue": "Only 1 left on 13 Apr; 2 needed" }`. After success, the Twin Room's `roomsLeft` for 10–14 Apr goes from 6, 2, 4, 3, 3 to 5, 1, 3, 2, 2. Booking can't be edited or cancelled in v1.

### E29 · GET /groups/:groupId/booking

Auth: member. → `200 { "booking": Booking }`, or `404 NOT_FOUND` when the group hasn't booked yet. The client treats this 404 as "not booked", not as an error.

Request: `GET /api/v1/groups/G-01/booking` with `X-Traveller-Id: T-001` → `200`

```json
{ "booking": { "bookingId": "BK-2027-000001", "groupId": "G-01", "optionId": "OPT-1001",
               "hotel": { "hotelId": "HTL-KYO-001", "name": "Gion Corner Hotel", "...": "..." },
               "room": { "roomId": "RM-KYO-001-A", "name": "Twin Room", "...": "..." },
               "roomsBooked": 1, "nights": ["2027-04-10", "2027-04-11", "2027-04-12", "2027-04-13", "2027-04-14"],
               "memberIds": ["T-001", "T-1001"], "totalInr": 23800, "perMemberInr": 11900,
               "status": "CONFIRMED", "bookedBy": "T-1001", "createdAt": "…" } }
```

Not booked yet → `404 { "error": { "code": "NOT_FOUND", "message": "This group has no booking yet.", "details": [], "requestId": "…" } }`. Other errors: `401`, `403` (not a member).

### 9.1 Change log

| Version | Date | Change |
| --- | --- | --- |
| v1.0 | 13 Nov 2026 | Initial contract: catalog in MongoDB with `roomsLeft` reduced on booking; `perMemberInr` rounded to 2 decimals (no per-member split list); no `source` field |
| v1.1 | 13 Nov 2026 | Completeness pass: path-parameter table (§2.1), request/response matrix for all 29 operations (§2.2), BookingQuote schema, example success payloads and error lists for E05–E07, E10, E12, E13, E16, E17, E19–E26, E29 |
| v1.2 | 13 Nov 2026 | One group per night: new `409 DATES_CONFLICT` (E15, E18) and `409 CONFLICT` (retry) codes; E18 also closes the seeker's overlapping pending requests and returns them in the new `closedSeekerRequestIds` field (additive); matches leave out groups that overlap a trip the seeker has joined (§7 pre-filters); new lifecycle row and invariant |
| v1.3 | 13 Nov 2026 | E28: the group is set BOOKED before rooms are reduced (undone on failure), new `409 CONFLICT` when a member joins mid-booking; `ROOMS_UNAVAILABLE` details shape documented (E22, E27, E28) |
