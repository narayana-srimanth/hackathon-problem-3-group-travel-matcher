# Data Dictionary: Problem 3 (Group Travel Matcher)

This file explains the mock data in this pack: what each file holds, what one record means, how the files link, and how your app uses them.

- All data is **synthetic** (invented). Real names are used only for cities and city areas. The people are fictional.
- The data is **read-only**. Do not change the files. Judges use the same files.
- The data covers **5 cities** (Tokyo, Kyoto, Osaka, Dubai, Abu Dhabi) and **1 to 20 April 2027**.
- **All prices are in INR** (whole rupees). There is no currency conversion.
- The problem statement's example uses Southeast Asia in December. **The data uses the 5 cities above in April 2027.** The rules are the same.

---

## 1. Files at a glance

| File | One record is | Records | Your app uses it to |
|---|---|---|---|
| `data/problem-3/travellers.json` | One traveller profile | 24 | Users who already exist at the start. Group owners and members come from here. |
| `data/problem-3/groups.json` | One open group post | 12 | Group posts that already exist at the start, so a search has results (M4) |
| `data/problem-3/interests.json` | One interest tag | 16 | The interest list in the sign-up form (M1) and the search form (M3) |
| `data/catalog/destinations.json` | The list of cities and countries | 1 object | The city list in the group post form (M2) and the search form (M3) |
| `data/catalog/hotels.json` | One hotel | 49 | Hotel search on the Common Group Page (M6) |
| `data/catalog/rooms.json` | One room type in one hotel | 125 | Room capacity and price per night (M6) |
| `data/catalog/availability.json` | One room type on one night | 2,500 | Free rooms on each night of the group's stay (M6) |
| `images/hotels/` | One hotel photo (JPG) | 10 | Show hotel photos (optional). Credits: `images/ATTRIBUTIONS.md`. |

---

## 2. How the files connect

```
groups.owner_id ─────────► travellers.traveller_id   (the owner's gender, preference, and interests are used to match)
groups.member_ids[] ─────► travellers.traveller_id   (the owner is also in member_ids)
travellers.interests[] ──► interests.interest
groups.city ─────────────► destinations.countries[].cities[].name ──► hotels.city
hotels.hotel_id ─────────► rooms.hotel_id ──► availability.room_id
```

### Which data each matching rule reads

A seeker's **search** (M3) is compared with each **group post** and the group's **owner profile**.

| Rule | From the seeker's search | From `groups.json` | From the owner in `travellers.json` |
|---|---|---|---|
| Same destination | `city` | `city` | – |
| Dates overlap (at least 2 shared nights) | `check_in`, `check_out` | `check_in`, `check_out` | – |
| Budget (difference at most 40% of the lower budget) | `budget_inr` | `budget_inr` | – |
| Shared interests (at least 2 with the owner) | `interests` | – | `interests` |
| Gender preference (both ways) | `gender`, `gender_preference` | – | `gender`, `gender_preference` |
| Group size (members + the seeker ≤ max) | – | `member_ids` (count), `max_size` | – |

### Worked example: Priya and Sarah's group

Priya searches: Kyoto, 9 to 16 April 2027, budget ₹62,000, interests `TEMPLES`, `STREET_FOOD`, `ADVENTURE`, female, `SAME_GENDER`.

| Rule | Data | Result |
|---|---|---|
| Same destination | `G-01` `city` = `Kyoto` | Kyoto = Kyoto. Match. |
| Dates overlap | `G-01` 10 → 15 April = nights of 10–14 April. Priya 9 → 16 April = nights of 9–15 April. | 5 shared nights (10–14 April). Match. |
| Budget | `G-01` ₹60,000, Priya ₹62,000 | Difference ₹2,000. 40% of ₹60,000 = ₹24,000. Match. |
| Shared interests | Owner `T-001` (Sarah): `TEMPLES`, `STREET_FOOD`, `PHOTOGRAPHY`, `BUDGET_STAYS` | 2 shared (`TEMPLES`, `STREET_FOOD`). Match. |
| Gender preference | Sarah: `FEMALE`, `SAME_GENDER`. Priya: `FEMALE`, `SAME_GENDER`. | Both allow the other. Match. |
| Group size | `G-01` `member_ids` = `["T-001"]`, `max_size` = 3 | 1 + 1 = 2 ≤ 3. Match. |

---

## 3. Files in detail

### `data/problem-3/travellers.json`

**What it is:** 24 people who already use your platform at the start. A profile holds only what stays the same for every trip.

**Why you need it:** group owners and members are travellers. The owner's profile is used in the matching rules. The user can act as one of these travellers, or sign up as a new one (M1).

```json
{ "traveller_id": "T-001", "name": "Sarah Thomas", "age": 27, "gender": "FEMALE", "home_city": "Bengaluru",
  "home_airport": "BLR", "interests": ["TEMPLES", "STREET_FOOD", "PHOTOGRAPHY", "BUDGET_STAYS"],
  "gender_preference": "SAME_GENDER" }
```

| Field | Meaning | How you use it |
|---|---|---|
| `traveller_id` | Unique ID | Links to `groups.owner_id` and `groups.member_ids` |
| `name` | Full name | Display (owner name in a match, member list) |
| `age` | Age in years (24 to 35 in this data) | Display |
| `gender` | `FEMALE` or `MALE` | Gender preference rule |
| `home_city`, `home_airport` | Home city in India and its airport (Bengaluru `BLR`, Delhi `DEL`, Mumbai `BOM`, Chennai `MAA`) | Display. Not used by any matching rule. |
| `interests` | Interest IDs from `interests.json` | Shared interests rule (the owner's interests) |
| `gender_preference` | `ANY`, or `SAME_GENDER` = travels only with people of the same gender | Gender preference rule. For a woman, `SAME_GENDER` means "female only". |

What to know:
- A profile has **no dates, no budget, and no group size**. These differ for each trip, so they are in a group post or in a search.

### `data/problem-3/groups.json`

**What it is:** 12 group posts that are open at the start. Each post has an owner, its members, a city, dates, a budget, and the group size the owner wants.

**Why you need it:** load these posts at the start, so a seeker's search has results. The judges' requests expect these groups to exist.

```json
{ "group_id": "G-01", "name": "Kyoto Spring Temples", "owner_id": "T-001", "member_ids": ["T-001"],
  "city": "Kyoto", "check_in": "2027-04-10", "check_out": "2027-04-15", "max_size": 3, "budget_inr": 60000,
  "itinerary": "Fushimi Inari at sunrise, Nishiki Market lunch, Gion walk, photo day in Arashiyama." }
```

| Field | Meaning | How you use it |
|---|---|---|
| `group_id` | Unique ID | Your own new groups can use your own ID format |
| `name` | Group name | Display |
| `owner_id` | The traveller who created the post | Links to `travellers.traveller_id`. The owner's profile is used to match. |
| `member_ids` | Travellers in the group now. **The owner is included.** | Group size rule: number of members + 1 ≤ `max_size`. Member list on the group page. |
| `city` | Destination city, one of the 5 cities in `destinations.json` | Same destination rule. Hotel search city (M6). |
| `check_in`, `check_out` | First night and check-out day of the trip | Dates rule. Hotel search dates (M6). |
| `max_size` | Total people the owner wants, owner included (3 or 4 in this data) | Group size rule |
| `budget_inr` | Approximate budget per person for the trip, in INR | Budget rule |
| `itinerary` | Proposed plan, free text | Display |

### `data/problem-3/interests.json`

**What it is:** the interest tags a traveller can choose.

**Why you need it:** profiles and searches use the `interest` IDs. Show the `label` to the user.

```json
{ "interest": "TEMPLES", "label": "Temples and shrines", "category": "CULTURE" }
```

| Field | Meaning | How you use it |
|---|---|---|
| `interest` | ID of the tag | Store it in profiles and searches. Compare IDs in the shared interests rule. |
| `label` | Text for the user | Display |
| `category` | `CULTURE`, `FOOD`, `SOCIAL`, `HOBBY`, `NATURE`, `ACTIVITY`, `STYLE` | Group the tags in the form (optional) |

### `data/catalog/destinations.json`

**What it is:** the countries and cities in the data. This file is shared with other problems.

**Why you need it:** a group post and a search take their city from `countries[].cities[].name`. A city that is not in this list has no hotel data.

```json
{ "departure_cities": [{ "airport": "BLR", "city": "Bengaluru" }, ...],
  "countries": [{ "code": "JP", "name": "Japan", "timezone": "Asia/Tokyo",
                  "cities": [{ "name": "Tokyo", "airports": ["NRT", "HND"] }, { "name": "Kyoto", "airports": ["KIX"] }, ...],
                  "links": [...] }, ...],
  "rules": { ... } }
```

| Field | Meaning | How you use it |
|---|---|---|
| `countries[].cities[].name` | The 5 destination cities | City list in the group post form and the search form |
| `countries[].name`, `code` | Japan (`JP`) and United Arab Emirates (`AE`) | Display (for example "Kyoto, Japan") |
| `countries[].timezone` | Time zone of the country | Dates on the group page are in this zone |
| `departure_cities` | Home cities in India: `{ "airport", "city" }` | Home city list in the sign-up form (optional) |
| `countries[].cities[].airports`, `countries[].links` (`from_city`, `to_city`, `transfer_ids`), `rules` (`min_nights`, `max_nights`, `min_nights_per_city`, `data_window`, `first_night`, `last_departure`) | Airports, transfers between cities, and trip rules of another problem | Not used in this problem |

### `data/catalog/hotels.json`

**What it is:** fictional hotels in the 5 cities (Tokyo 13, Kyoto 12, Osaka 10, Dubai 8, Abu Dhabi 6). This file is shared with other problems.

**Why you need it:** members search hotels on the Common Group Page in the group's city (M6).

```json
{ "hotel_id": "HTL-KYO-001", "name": "Gion Corner Hotel", "aliases": [], "city": "Kyoto", "area": "Gion",
  "lat": 35.0037, "lng": 135.7788, "rating": 7.8, "stars": 3, "check_in_from": "15:00", "check_out_until": "11:00",
  "family_friendly": false, "image": "images/hotels/HOTEL-BUSINESS-1.jpg" }
```

| Field | Meaning | How you use it |
|---|---|---|
| `hotel_id` | Unique ID | Links to `rooms.hotel_id` |
| `name`, `area` | Hotel name and part of the city | Display |
| `city` | City of the hotel | Search filter: the group's city |
| `rating` | Guest rating, 6.9 to 9.4 (scale 0–10) | Display, sort |
| `stars` | Hotel class, 2 to 5 | Display, sort |
| `image` | Path to a photo in `images/hotels/` (in this pack) | Display (optional). 10 generic photos are shared by type. |
| `aliases`, `lat`, `lng`, `check_in_from`, `check_out_until`, `family_friendly` | Hotel details | Display only (optional) |

### `data/catalog/rooms.json`

**What it is:** the room types of each hotel (1 to 3 per hotel), with capacity and price. This file is shared with other problems.

**Why you need it:** the hotel price for the group comes from the room type, the number of rooms, and the nights.

```json
{ "room_id": "RM-KYO-001-A", "hotel_id": "HTL-KYO-001", "room_type": "TWIN", "name": "Twin Room",
  "max_adults": 2, "max_children": 0, "price_per_night": { "amount": 4760, "currency": "INR" }, "refundable": true }
```

| Field | Meaning | How you use it |
|---|---|---|
| `room_id` | Unique ID of the room type | Links to `availability.room_id` |
| `hotel_id` | The hotel | Links to `hotels.hotel_id` |
| `room_type`, `name` | `SINGLE`, `TWIN`, `DOUBLE`, `TRIPLE`, `FAMILY`, `FAMILY_SUITE`, and the display name | Display |
| `max_adults` | Adults that **one** room holds | Rooms needed for the group: members ÷ `max_adults`, rounded up |
| `max_children` | Children that one room holds | Not needed: all travellers in this data are adults |
| `price_per_night` | Price of one room for one night | Total = `price_per_night` × rooms × nights |
| `refundable` | Free cancellation | Display only |

### `data/catalog/availability.json`

**What it is:** how many rooms of each type are free on each night, 1 to 20 April 2027. This file is shared with other problems.

**Why you need it:** a hotel option is possible only if enough rooms are free on every night of the group's stay.

```json
{ "room_id": "RM-KYO-001-A", "date": "2027-04-10", "rooms_left": 6 }
```

| Field | Meaning | How you use it |
|---|---|---|
| `room_id` | The room type | Links to `rooms.room_id` |
| `date` | The night: the date you sleep there | The group's nights are `check_in` up to the day before `check_out` |
| `rooms_left` | Free rooms of this type that night. `0` = full. | `rooms_left` ≥ rooms needed, on every night |

### Worked example: cost split on the Common Group Page

Sarah's group `G-01` (Kyoto, 10 → 15 April) has 2 members after Priya joins.

| Step | Data | Result |
|---|---|---|
| Nights | 10 → 15 April | 5 nights: 10, 11, 12, 13, 14 April |
| Room | `RM-KYO-001-A` (Twin Room, Gion Corner Hotel), `max_adults` 2, ₹4,760 per night | 2 members ÷ 2 = 1 room |
| Free rooms | `availability.json`, nights 10–14 April: 6, 2, 4, 3, 3 | At least 1 every night. Possible. |
| Total | ₹4,760 × 1 room × 5 nights | ₹23,800 |
| Per member | ₹23,800 ÷ 2 members | ₹11,900 |

### `images/hotels/`

10 generic hotel photos with free licenses (Wikimedia Commons). Hotels are fictional, so hotels of the same type share a photo. If your app shows photos, also show the credits from `images/ATTRIBUTIONS.md`.

---

## 4. Data your app creates

The files are read-only. Your app keeps its own data in its own database. It must survive a page refresh and a backend restart.

| Your data | Created when | Holds (minimum) |
|---|---|---|
| Traveller | A user signs up (M1). The 24 travellers are loaded at the start. | Name, gender, home city, interests, gender preference |
| Group post | An owner creates a post (M2). The 12 groups are loaded at the start. | Owner, members, city, dates, group size, budget, itinerary, name |
| Search | A seeker searches (M3) | City, dates, interests, budget, gender, gender preference (and home city) |
| Join request | A seeker clicks "Interested" (M5) | Group, seeker, status (pending, approved, rejected) |
| Saved hotel option | A member saves a hotel on the group page (M6) | Group, hotel, room type, rooms, total, per-member cost |
| Group booking | A member confirms the booking (M6) | Group, hotel option, total, per-member cost, your own booking ID |

When the owner approves a join request, add the seeker to the group's members. The group then has one less free place.

---

## 5. Conventions

| Topic | Rule |
|---|---|
| Dates | `YYYY-MM-DD`, local date of the destination city |
| Valid dates | 1 to 20 April 2027 (`check_in` from 1 April, `check_out` up to 20 April). Hotels have no data outside this window. |
| Valid cities | Tokyo, Kyoto, Osaka, Dubai, Abu Dhabi |
| Nights | A stay from `check_in` 10 April to `check_out` 15 April has 5 nights: 10, 11, 12, 13, 14 April. The `check_out` day is not a night. |
| Shared nights | Nights that are in both stays. 10 → 15 April and 14 → 18 April share 1 night (14 April). |
| Budget | Approximate amount per person for the trip, whole INR. Compare the two numbers as they are. |
| Prices | Rooms use `{ "amount", "currency": "INR" }`. Always INR. |
| Gender values | `FEMALE`, `MALE`. Preference values: `ANY`, `SAME_GENDER`. |
| IDs | Stable text IDs, for example `T-001`, `G-01`, `TEMPLES`, `HTL-KYO-001`, `RM-KYO-001-A`. Use them as keys. |

---

## 6. Data FAQ

**The problem statement talks about Bangkok and December. Where is that data?** There is none. The data uses Tokyo, Kyoto, Osaka, Dubai, and Abu Dhabi in April 2027. The rules are the same.

**What if a search uses a city or date that is not in the data?** Show a clear message that the city or dates are not available.

**Where is a traveller's budget?** On the group post (`budget_inr`) and in the seeker's search. A profile has no budget, because it can be different for each trip.

**Are the seeker's interests from the profile or from the search?** The search form has its own interests (M3). Fill it with the profile's interests as a start, if you like.

**Is the owner counted in `member_ids` and `max_size`?** Yes, in both.

**Which budget is "the lower budget"?** The smaller of the two numbers: the group's `budget_inr` or the seeker's budget.

**Are there reviews or ratings of travellers (G2)?** No. They are not in the data. Store them in your database if you build them.

**How many rooms does a group need?** Your app decides, with `max_adults`. The members must fit: rooms × `max_adults` ≥ members.

**Do we need flights or transfers?** No. This problem uses hotels only.

**Can we add our own data?** Yes, in your own database. Do not change the files in `data/`.
