// Mirrors "Group Travel Matcher — API Specification v1", §4 Schemas.
// Change the spec first, then this file.

export type ISODate = string; // 'YYYY-MM-DD'
export type Gender = 'FEMALE' | 'MALE';
export type GenderPreference = 'ANY' | 'SAME_GENDER';
export type Page<T> = { items: T[]; page: number; limit: number; total: number };

// ---- Meta ----
export interface Interest {
  interest: string;
  label: string;
  category: 'CULTURE' | 'FOOD' | 'SOCIAL' | 'HOBBY' | 'NATURE' | 'ACTIVITY' | 'STYLE';
}
export interface City {
  name: string; country: string; countryCode: string; timezone: string;
  image?: string; // optional: city photo path served by the backend, e.g. /static/cities/kyoto.jpg
}
export interface Destinations {
  cities: City[];
  departureCities: { city: string; airport: string }[];
  dataWindow: { from: ISODate; to: ISODate };
}

// ---- Travellers ----
export interface Traveller {
  travellerId: string; name: string; age: number | null; gender: Gender;
  homeCity: string; homeAirport: string; interests: string[]; genderPreference: GenderPreference; createdAt: string;
}
export type TravellerSummary = Pick<Traveller, 'travellerId' | 'name' | 'gender' | 'homeCity'>;
export interface TravellerGroupRef {
  groupId: string; name: string; city: string; checkIn: ISODate; checkOut: ISODate; role: 'OWNER' | 'MEMBER';
}

// ---- Co-traveller reviews (E30–E32) ----
/** From co-traveller reviews. average is null until the first review (1 decimal, 1–5). */
export interface RatingSummary { average: number | null; count: number }
export interface Review {
  reviewId: string; groupId: string; reviewerId: string; revieweeId: string;
  rating: number; comment: string | null; createdAt: string;
}
export type RatedTraveller = TravellerSummary & { rating: RatingSummary };
export interface GroupReviewStatus {
  groupId: string; opensOn: ISODate; open: boolean;
  coTravellers: { traveller: RatedTraveller; myReview: Review | null }[];
}
export interface TravellerReviewItem {
  review: Review;
  reviewer: TravellerSummary | null;
  trip: { groupId: string; name: string; city: string; checkIn: ISODate; checkOut: ISODate } | null;
}
export interface TravellerReviews extends Page<TravellerReviewItem> { rating: RatingSummary }

// ---- Group chat (E33–E34) ----
export interface Message {
  messageId: string; groupId: string;
  sender: { travellerId: string; name: string | null };
  body: string; createdAt: string;
}
/** Oldest first. hasMore: older messages exist (latest / before), or more new ones are waiting (after). */
export interface MessagePage { items: Message[]; hasMore: boolean }

// ---- Groups ----
export type GroupStatus = 'OPEN' | 'FULL' | 'BOOKED';
export type ViewerRelation = 'OWNER' | 'MEMBER' | 'PENDING' | 'REJECTED' | 'NONE';
export interface GroupMember extends TravellerSummary { isOwner: boolean; rating: RatingSummary }
export interface Group {
  groupId: string; name: string; city: string; country: string; timezone: string;
  checkIn: ISODate; checkOut: ISODate; nights: number;
  maxSize: number; memberCount: number; freeSpots: number;
  budgetInr: number; itinerary: string; status: GroupStatus;
  owner: { travellerId: string; name: string; gender: Gender; rating: RatingSummary };
  members: GroupMember[];
  viewer: { relation: ViewerRelation; requestId: string | null; pendingRequestCount: number | null };
  createdAt: string;
}

// ---- Search & matching ----
export type RuleId = 'SAME_CITY' | 'DATES_OVERLAP' | 'BUDGET' | 'SHARED_INTERESTS' | 'GENDER' | 'GROUP_SIZE';
export interface Search {
  searchId: string; travellerId: string; homeCity: string; city: string; checkIn: ISODate; checkOut: ISODate; nights: number;
  interests: string[]; budgetInr: number; gender: Gender; genderPreference: GenderPreference; createdAt: string;
}
export interface MatchReasons {
  sharedNights: number; sharedFrom: ISODate; sharedTo: ISODate;
  sharedInterests: string[]; budgetDiffInr: number; budgetLimitInr: number;
  gender: string;
  spotsAfterJoin: number;
}
export interface MatchCard {
  groupId: string; name: string; city: string; checkIn: ISODate; checkOut: ISODate;
  memberCount: number; maxSize: number; freeSpots: number; budgetInr: number;
  owner: { travellerId: string; name: string; rating: RatingSummary };
  score: number;
  reasons: MatchReasons;
  viewerRequestStatus: RequestStatus | null;
}
export interface RuleCheck {
  rule: RuleId; passed: boolean;
  sharedNights?: number; diffInr?: number; limitInr?: number; shared?: string[]; freeAfterJoin?: number;
  message: string;
}
export interface Evaluation { eligible: boolean; checks: RuleCheck[]; failed: RuleId[] }
export interface EmptyHint {
  type: 'WIDEN_DATES' | 'ADJUST_BUDGET' | 'ADD_INTERESTS' | 'OTHER_CITY';
  message: string;
  groupId?: string;
}
export type GenderComposition = 'ALL_FEMALE' | 'ALL_MALE' | 'MIXED';

// ---- Join requests ----
export type RequestStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'WITHDRAWN' | 'CLOSED';
export interface JoinRequest {
  requestId: string; groupId: string; seekerId: string; searchId: string; status: RequestStatus; message: string | null;
  matchSnapshot: { sharedNights: number; sharedInterests: string[]; budgetDiffInr: number; score: number };
  createdAt: string; decidedAt: string | null; decidedBy: string | null;
}
export interface MyJoinRequestItem {
  request: JoinRequest;
  group: { groupId: string; name: string; city: string; checkIn: ISODate; checkOut: ISODate; owner: { name: string } };
}

// ---- Hotels, options, booking ----
export type RoomType = 'SINGLE' | 'TWIN' | 'DOUBLE' | 'TRIPLE' | 'FAMILY' | 'FAMILY_SUITE';
export const ROOM_TYPES: RoomType[] = ['SINGLE', 'TWIN', 'DOUBLE', 'TRIPLE', 'FAMILY', 'FAMILY_SUITE'];

export interface Hotel {
  hotelId: string; name: string; city: string; area: string; stars: number; rating: number;
  image: string; checkInFrom: string; checkOutUntil: string;
}
export interface Room {
  roomId: string; roomType: RoomType; name: string; maxAdults: number; pricePerNightInr: number; refundable: boolean;
}
export interface RoomOption extends Room {
  roomsNeeded: number; nights: number; totalInr: number;
  perMemberInr: number;
  budgetSharePct: number;
  minRoomsLeft: number; savedOptionId: string | null;
}
export interface HotelResult { hotel: Hotel; cheapestPerMemberInr: number; options: RoomOption[] }
export interface HotelSearchContext {
  groupId: string; city: string; checkIn: ISODate; checkOut: ISODate;
  nights: ISODate[]; partySize: number; budgetInr: number; timezone: string;
}
export interface HotelSearchResponse extends Page<HotelResult> { context: HotelSearchContext }

export interface SavedOption {
  optionId: string; groupId: string; hotel: Hotel; room: Room; savedBy: string; createdAt: string;
  votes: string[]; voteCount: number; memberCount: number; allAgree: boolean;
  snapshot: { memberCount: number; roomsNeeded: number; totalInr: number; perMemberInr: number };
  live: { roomsNeeded: number; totalInr: number; perMemberInr: number; available: boolean };
  stale: boolean;
}
export interface Booking {
  bookingId: string; groupId: string; optionId: string; hotel: Hotel; room: Room;
  roomsBooked: number; nights: ISODate[]; memberIds: string[];
  totalInr: number; perMemberInr: number; status: 'CONFIRMED'; bookedBy: string; createdAt: string;
}
export interface BookingQuote {
  optionId: string; hotelName: string; roomName: string; checkIn: ISODate; checkOut: ISODate;
  nights: number; roomsNeeded: number; memberCount: number; pricePerNightInr: number;
  totalInr: number; perMemberInr: number; available: boolean;
  members: { travellerId: string; name: string }[];
}

// ---- Errors (§3) ----
export type ErrorCode =
  | 'VALIDATION_ERROR' | 'UNAUTHENTICATED' | 'FORBIDDEN' | 'NOT_FOUND'
  | 'OWN_GROUP' | 'ALREADY_MEMBER' | 'DUPLICATE_REQUEST' | 'GROUP_FULL' | 'GROUP_CLOSED'
  | 'REQUEST_NOT_PENDING' | 'ALREADY_SAVED' | 'ALREADY_BOOKED'
  | 'DATES_CONFLICT' | 'CONFLICT' // spec v1.2 / v1.3
  | 'OUT_OF_DATA_RANGE' | 'NOT_ELIGIBLE' | 'ROOMS_UNAVAILABLE'
  | 'TRIP_NOT_ENDED' | 'ALREADY_REVIEWED' // co-traveller reviews
  | 'INTERNAL' | 'NETWORK';

export interface ErrorDetail {
  field?: string; rule?: RuleId; issue: string;
  date?: ISODate; roomsLeft?: number; roomsNeeded?: number; // ROOMS_UNAVAILABLE
  groupId?: string;                                         // DATES_CONFLICT: the trip it clashes with
}
