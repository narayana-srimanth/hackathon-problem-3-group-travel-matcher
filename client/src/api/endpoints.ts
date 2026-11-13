// One function per operation in the API spec (E01–E29).
import { request } from './client';
import type {
  Booking, BookingQuote, Destinations, EmptyHint, Evaluation, GenderComposition, GenderPreference, Gender,
  Group, HotelSearchResponse, Interest, JoinRequest, MatchCard, MyJoinRequestItem, Page, RequestStatus,
  RoomType, SavedOption, Search, Traveller, TravellerGroupRef, TravellerSummary,
} from './types';

// ---- §5 Meta and travellers ----
export const getHealth = () =>
  request<{ status: string; db: string; time: string }>('GET', '/health', { auth: false });                  // E01
export const getInterests = () =>
  request<{ items: Interest[] }>('GET', '/meta/interests', { auth: false });                                  // E02
export const getDestinations = () =>
  request<Destinations>('GET', '/meta/destinations', { auth: false });                                        // E03

export interface NewTraveller {
  name: string; gender: Gender; homeCity: string; interests: string[]; genderPreference: GenderPreference; age?: number;
}
export const createTraveller = (body: NewTraveller) =>
  request<{ traveller: Traveller }>('POST', '/travellers', { body, auth: false });                            // E04
export const listTravellers = (query: { query?: string; page?: number; limit?: number }) =>
  request<Page<TravellerSummary>>('GET', '/travellers', { query, auth: false });                              // E05
export const getTraveller = (travellerId: string) =>
  request<{ traveller: Traveller; groups: TravellerGroupRef[] }>('GET', `/travellers/${encodeURIComponent(travellerId)}`); // E06
export const getMe = () => request<{ traveller: Traveller }>('GET', '/me');                                    // E07

// ---- §6 Groups ----
export interface NewGroup {
  name: string; city: string; checkIn: string; checkOut: string; maxSize: number; budgetInr: number; itinerary?: string;
}
export const createGroup = (body: NewGroup) => request<{ group: Group }>('POST', '/groups', { body });       // E08
export const getGroup = (groupId: string) =>
  request<{ group: Group }>('GET', `/groups/${encodeURIComponent(groupId)}`);                                 // E09
export const getMyGroups = () =>
  request<{ owned: Group[]; memberOf: Group[]; totalPendingRequests: number }>('GET', '/me/groups');          // E10

// ---- §7 Searches and matches ----
export interface NewSearch {
  homeCity: string; city: string; checkIn: string; checkOut: string; interests: string[];
  budgetInr: number; genderPreference: GenderPreference; limit?: number;
}
export interface MatchesResponse { matches: Page<MatchCard>; emptyStateHints: EmptyHint[] }
export const createSearch = (body: NewSearch) =>
  request<{ search: Search } & MatchesResponse>('POST', '/searches', { body });                              // E11
export const getSearch = (searchId: string) =>
  request<{ search: Search }>('GET', `/searches/${encodeURIComponent(searchId)}`);                            // E12
export interface MatchFilters {
  page?: number; limit?: number; sharedInterest?: string[]; genderComposition?: GenderComposition;
}
export const getMatches = (searchId: string, f: MatchFilters) =>
  request<MatchesResponse>('GET', `/searches/${encodeURIComponent(searchId)}/matches`, { query: { ...f } });  // E13
export const getEvaluation = (searchId: string, groupId: string) =>
  request<Evaluation>('GET', `/searches/${encodeURIComponent(searchId)}/groups/${encodeURIComponent(groupId)}/evaluation`); // E14

// ---- §8 Join requests ----
export const createJoinRequest = (groupId: string, body: { searchId: string; message?: string }) =>
  request<{ request: JoinRequest; group: Group }>('POST', `/groups/${encodeURIComponent(groupId)}/join-requests`, { body }); // E15
export type RequestStatusFilter = RequestStatus | 'ALL';
export const getGroupJoinRequests = (groupId: string, query: { status?: RequestStatusFilter; page?: number; limit?: number }) =>
  request<Page<{ request: JoinRequest; seeker: Traveller }>>('GET', `/groups/${encodeURIComponent(groupId)}/join-requests`, { query }); // E16
export const getMyJoinRequests = (query: { status?: RequestStatus; page?: number; limit?: number }) =>
  request<Page<MyJoinRequestItem>>('GET', '/me/join-requests', { query });                                    // E17
export const approveJoinRequest = (requestId: string) =>
  request<{ request: JoinRequest; group: Group; closedRequestIds: string[]; closedSeekerRequestIds: string[] }>(
    'POST', `/join-requests/${encodeURIComponent(requestId)}/approve`); // E18 (closedSeekerRequestIds: spec v1.2)
export const rejectJoinRequest = (requestId: string) =>
  request<{ request: JoinRequest }>('POST', `/join-requests/${encodeURIComponent(requestId)}/reject`);       // E19
export const withdrawJoinRequest = (requestId: string) =>
  request<{ request: JoinRequest }>('POST', `/join-requests/${encodeURIComponent(requestId)}/withdraw`);     // E20

// ---- §9 Common group page ----
export interface HotelFilters {
  sort?: 'perMember' | 'rating' | 'stars';
  minStars?: number; minRating?: number; maxPerMemberInr?: number;
  roomType?: RoomType; planFor?: 'CURRENT' | 'MAX'; page?: number; limit?: number;
}
const g = (groupId: string) => `/groups/${encodeURIComponent(groupId)}`;
export const searchHotels = (groupId: string, query: HotelFilters) =>
  request<HotelSearchResponse>('GET', `${g(groupId)}/hotels`, { query: { ...query } });                      // E21
export const saveOption = (groupId: string, roomId: string) =>
  request<{ option: SavedOption }>('POST', `${g(groupId)}/saved-options`, { body: { roomId } });             // E22
export const getSavedOptions = (groupId: string) =>
  request<{ items: SavedOption[] }>('GET', `${g(groupId)}/saved-options`);                                    // E23
export const deleteOption = (groupId: string, optionId: string) =>
  request<{ deleted: string }>('DELETE', `${g(groupId)}/saved-options/${encodeURIComponent(optionId)}`);      // E24
export const voteOption = (groupId: string, optionId: string) =>
  request<{ option: SavedOption }>('POST', `${g(groupId)}/saved-options/${encodeURIComponent(optionId)}/vote`);   // E25
export const unvoteOption = (groupId: string, optionId: string) =>
  request<{ option: SavedOption }>('DELETE', `${g(groupId)}/saved-options/${encodeURIComponent(optionId)}/vote`); // E26
export const getBookingQuote = (groupId: string, optionId: string) =>
  request<BookingQuote>('POST', `${g(groupId)}/booking/quote`, { body: { optionId } });                      // E27
export const createBooking = (groupId: string, optionId: string) =>
  request<{ booking: Booking; group: Group }>('POST', `${g(groupId)}/booking`, { body: { optionId } });      // E28
export const getBooking = (groupId: string) =>
  request<{ booking: Booking }>('GET', `${g(groupId)}/booking`);                                              // E29
