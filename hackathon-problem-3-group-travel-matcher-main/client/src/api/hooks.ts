import { useMutation, useQuery, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import * as api from './endpoints';
import { isApiError } from './client';
import type { Group, Message } from './types';

// Central list of cache keys so invalidation stays consistent.
export const qk = {
  interests: ['meta', 'interests'] as const,
  destinations: ['meta', 'destinations'] as const,
  me: ['me'] as const,
  travellers: (q: string) => ['travellers', q] as const,
  traveller: (id: string) => ['traveller', id] as const,
  myGroups: ['me', 'groups'] as const,
  myRequests: ['me', 'join-requests'] as const,
  group: (id: string) => ['group', id] as const,
  search: (id: string) => ['search', id] as const,
  matches: (id: string, f: api.MatchFilters) => ['search', id, 'matches', f] as const,
  evaluation: (sid: string, gid: string) => ['search', sid, 'evaluation', gid] as const,
  groupRequests: (gid: string) => ['group', gid, 'join-requests'] as const,
  hotels: (gid: string, f: api.HotelFilters) => ['group', gid, 'hotels', f] as const,
  saved: (gid: string) => ['group', gid, 'saved'] as const,
  booking: (gid: string) => ['group', gid, 'booking'] as const,
  groupReviews: (gid: string) => ['group', gid, 'reviews'] as const,
  messages: (gid: string) => ['group', gid, 'messages'] as const,
  travellerReviews: (id: string, page: number) => ['traveller', id, 'reviews', page] as const,
};

// ---- Meta (never changes during a session) ----
export const useInterests = () =>
  useQuery({ queryKey: qk.interests, queryFn: api.getInterests, staleTime: Infinity, select: (d) => d.items });
export const useDestinations = () =>
  useQuery({ queryKey: qk.destinations, queryFn: api.getDestinations, staleTime: Infinity });

/** Interest ID → label, from the server's list. */
export function useInterestLabel() {
  const { data } = useInterests();
  return (id: string) => data?.find((i) => i.interest === id)?.label ?? id;
}

// ---- Travellers ----
export const useTravellers = (query: string) =>
  useQuery({
    queryKey: qk.travellers(query),
    queryFn: () => api.listTravellers({ query: query || undefined, limit: 50 }),
    placeholderData: keepPreviousData,
  });
export const useTraveller = (id: string) =>
  useQuery({ queryKey: qk.traveller(id), queryFn: () => api.getTraveller(id) });

// ---- Groups ----
export const useMyGroups = (enabled = true) =>
  useQuery({ queryKey: qk.myGroups, queryFn: api.getMyGroups, enabled, refetchInterval: 15_000 }); // badge poll (E10)
export const useGroup = (id: string) =>
  useQuery({ queryKey: qk.group(id), queryFn: () => api.getGroup(id), select: (d) => d.group, refetchInterval: 15_000 });

/** Put a group returned by a mutation straight into the cache (the client never re-derives server state). */
function useGroupWriter() {
  const qc = useQueryClient();
  return (group: Group) => {
    qc.setQueryData(qk.group(group.groupId), { group });
    qc.invalidateQueries({ queryKey: qk.myGroups });
  };
}

export function useCreateGroup() {
  const writeGroup = useGroupWriter();
  return useMutation({ mutationFn: api.createGroup, onSuccess: (d) => writeGroup(d.group) });
}

// ---- Searches ----
export function useCreateSearch() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: api.createSearch,
    onSuccess: (d, body) => {
      qc.setQueryData(qk.search(d.search.searchId), { search: d.search });
      // Prime the exact key the results page reads first (page 1, same page size, no filters),
      // so the first page shows without a second request.
      const firstPage: api.MatchFilters = { page: 1, limit: body.limit ?? d.matches.limit };
      qc.setQueryData(qk.matches(d.search.searchId, firstPage), { matches: d.matches, emptyStateHints: d.emptyStateHints });
    },
  });
}
export const useSearch = (id: string | undefined) =>
  useQuery({ queryKey: qk.search(id ?? ''), queryFn: () => api.getSearch(id!), enabled: !!id, select: (d) => d.search });
export const useMatches = (id: string | undefined, f: api.MatchFilters) =>
  useQuery({
    queryKey: qk.matches(id ?? '', f),
    queryFn: () => api.getMatches(id!, f),
    enabled: !!id,
    placeholderData: keepPreviousData,
  });
export const useEvaluation = (searchId: string | undefined, groupId: string) =>
  useQuery({
    queryKey: qk.evaluation(searchId ?? '', groupId),
    queryFn: () => api.getEvaluation(searchId!, groupId),
    enabled: !!searchId,
    retry: false,
  });

// ---- Join requests ----
export function useCreateJoinRequest(groupId: string) {
  const qc = useQueryClient();
  const writeGroup = useGroupWriter();
  return useMutation({
    mutationFn: (body: { searchId: string; message?: string }) => api.createJoinRequest(groupId, body),
    onSuccess: (d) => {
      writeGroup(d.group);
      qc.invalidateQueries({ queryKey: ['search'] });
      qc.invalidateQueries({ queryKey: qk.myRequests });
    },
  });
}
export const useGroupJoinRequests = (groupId: string, enabled: boolean) =>
  useQuery({
    queryKey: qk.groupRequests(groupId),
    queryFn: () => api.getGroupJoinRequests(groupId, { status: 'PENDING', limit: 50 }),
    enabled,
    refetchInterval: 15_000,
  });
export const useMyJoinRequests = () =>
  useQuery({ queryKey: qk.myRequests, queryFn: () => api.getMyJoinRequests({ limit: 50 }), refetchInterval: 15_000 });

export function useDecideRequest(groupId: string) {
  const qc = useQueryClient();
  const writeGroup = useGroupWriter();
  return useMutation({
    mutationFn: async ({ requestId, action }: { requestId: string; action: 'approve' | 'reject' }) =>
      action === 'approve'
        ? { action, ...(await api.approveJoinRequest(requestId)) }
        : { action, ...(await api.rejectJoinRequest(requestId)), group: undefined, closedRequestIds: [] as string[] },
    onSuccess: (d) => { if (d.group) writeGroup(d.group); },
    onSettled: (_d, err) => {
      qc.invalidateQueries({ queryKey: qk.groupRequests(groupId) });
      qc.invalidateQueries({ queryKey: qk.myGroups });
      // A GROUP_FULL on approve changes the group too.
      if (isApiError(err)) qc.invalidateQueries({ queryKey: qk.group(groupId) });
    },
  });
}

export function useWithdrawRequest() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (requestId: string) => api.withdrawJoinRequest(requestId),
    onSettled: (d) => {
      qc.invalidateQueries({ queryKey: qk.myRequests });
      qc.invalidateQueries({ queryKey: ['search'] });
      if (d) qc.invalidateQueries({ queryKey: qk.group(d.request.groupId) });
    },
  });
}

// ---- Common group page ----
export const useHotels = (groupId: string, f: api.HotelFilters, enabled: boolean) =>
  useQuery({
    queryKey: qk.hotels(groupId, f),
    queryFn: () => api.searchHotels(groupId, f),
    enabled,
    placeholderData: keepPreviousData,
  });
export const useSavedOptions = (groupId: string, enabled: boolean) =>
  useQuery({
    queryKey: qk.saved(groupId),
    queryFn: () => api.getSavedOptions(groupId),
    enabled,
    select: (d) => d.items,
    refetchInterval: 10_000, // see other members' votes without refreshing
  });
export const useBooking = (groupId: string, enabled: boolean) =>
  useQuery({
    queryKey: qk.booking(groupId),
    // E29: 404 means "not booked yet", not an error.
    queryFn: async () => {
      try { return (await api.getBooking(groupId)).booking; }
      catch (e) { if (isApiError(e) && e.code === 'NOT_FOUND') return null; throw e; }
    },
    enabled,
    refetchInterval: 15_000,
  });

function useGroupPageInvalidator(groupId: string) {
  const qc = useQueryClient();
  return () => {
    qc.invalidateQueries({ queryKey: qk.saved(groupId) });
    qc.invalidateQueries({ queryKey: ['group', groupId, 'hotels'] });
  };
}

export function useSaveOption(groupId: string) {
  const refresh = useGroupPageInvalidator(groupId);
  return useMutation({ mutationFn: (roomId: string) => api.saveOption(groupId, roomId), onSettled: refresh });
}
export function useDeleteOption(groupId: string) {
  const refresh = useGroupPageInvalidator(groupId);
  return useMutation({ mutationFn: (optionId: string) => api.deleteOption(groupId, optionId), onSettled: refresh });
}
export function useToggleVote(groupId: string) {
  const refresh = useGroupPageInvalidator(groupId);
  return useMutation({
    mutationFn: ({ optionId, voted }: { optionId: string; voted: boolean }) =>
      voted ? api.unvoteOption(groupId, optionId) : api.voteOption(groupId, optionId),
    onSettled: refresh,
  });
}
export function useBookingQuote(groupId: string) {
  return useMutation({ mutationFn: (optionId: string) => api.getBookingQuote(groupId, optionId) });
}
export function useCreateBooking(groupId: string) {
  const qc = useQueryClient();
  const writeGroup = useGroupWriter();
  const refresh = useGroupPageInvalidator(groupId);
  return useMutation({
    mutationFn: (optionId: string) => api.createBooking(groupId, optionId),
    onSuccess: (d) => {
      qc.setQueryData(qk.booking(groupId), d.booking);
      writeGroup(d.group);
    },
    onSettled: () => {
      refresh();
      qc.invalidateQueries({ queryKey: qk.booking(groupId) });
      qc.invalidateQueries({ queryKey: qk.group(groupId) });
    },
  });
}

// ---- Co-traveller reviews ----
export const useGroupReviews = (groupId: string) =>
  useQuery({ queryKey: qk.groupReviews(groupId), queryFn: () => api.getGroupReviews(groupId) });
export const useTravellerReviews = (travellerId: string, page: number) =>
  useQuery({
    queryKey: qk.travellerReviews(travellerId, page),
    queryFn: () => api.getTravellerReviews(travellerId, { page, limit: 10 }),
    placeholderData: keepPreviousData,
  });
export function useCreateReview(groupId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: api.NewReview) => api.createReview(groupId, body),
    onSettled: (d) => {
      qc.invalidateQueries({ queryKey: qk.groupReviews(groupId) });
      qc.invalidateQueries({ queryKey: qk.group(groupId) }); // members' ratings changed
      if (d) qc.invalidateQueries({ queryKey: ['traveller', d.review.revieweeId] }); // their profile + reviews
    },
  });
}

// ---- Group chat ----
/** What the chat cache holds: messages oldest first, and whether older ones can still be loaded. */
export interface ChatCache { items: Message[]; hasMoreOlder: boolean }

const seqOf = (m: Message) => Number(m.messageId.slice('MSG-'.length));
/** Union by messageId, in send order (a poll and a send can return the same message). */
function mergeMessages(a: Message[], b: Message[]): Message[] {
  const byId = new Map<string, Message>();
  for (const m of [...a, ...b]) byId.set(m.messageId, m);
  return [...byId.values()].sort((x, y) => seqOf(x) - seqOf(y));
}

/**
 * The group's chat, polled: fast (4 s) while the chat is open, slower otherwise (for the unread badge).
 * The first load gets the latest page; every poll after that only asks for messages after the last one.
 */
export function useGroupMessages(groupId: string, open: boolean) {
  const qc = useQueryClient();
  const key = qk.messages(groupId);
  return useQuery({
    queryKey: key,
    queryFn: async (): Promise<ChatCache> => {
      const cur = qc.getQueryData<ChatCache>(key);
      const last = cur?.items[cur.items.length - 1];
      if (!cur || !last) {
        const r = await api.getMessages(groupId, {});
        return { items: r.items, hasMoreOlder: r.hasMore };
      }
      const r = await api.getMessages(groupId, { after: last.messageId, limit: 100 });
      if (r.hasMore) { // a big burst since the last poll: just reload the latest page
        const latest = await api.getMessages(groupId, {});
        return { items: latest.items, hasMoreOlder: latest.hasMore };
      }
      return r.items.length ? { ...cur, items: mergeMessages(cur.items, r.items) } : cur;
    },
    refetchInterval: open ? 4_000 : 15_000,
  });
}

export function useSendMessage(groupId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: string) => api.sendMessage(groupId, body),
    onSuccess: ({ message }) =>
      qc.setQueryData<ChatCache>(qk.messages(groupId), (cur) =>
        cur ? { ...cur, items: mergeMessages(cur.items, [message]) } : { items: [message], hasMoreOlder: false }),
  });
}

/** "Load earlier messages": prepend the page before the oldest one we have. */
export function useLoadEarlierMessages(groupId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (beforeId: string) => api.getMessages(groupId, { before: beforeId }),
    onSuccess: (r) =>
      qc.setQueryData<ChatCache>(qk.messages(groupId), (cur) =>
        cur ? { items: mergeMessages(r.items, cur.items), hasMoreOlder: r.hasMore } : cur),
  });
}
