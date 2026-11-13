import { isApiError } from '../api/client';
import type { ErrorCode } from '../api/types';

// Friendly wording per error code. The server's own message is used when we
// don't have a better one (it already names allowed values, failing rules, etc.).
const FRIENDLY: Partial<Record<ErrorCode, string>> = {
  NETWORK: "Can't reach the server. Check that the backend is running.",
  FORBIDDEN: "You don't have access to this.",
  OWN_GROUP: "This is your own group, so you can't request to join it.",
  ALREADY_MEMBER: "You're already in this group.",
  DUPLICATE_REQUEST: "You've already asked to join. Wait for the owner to reply.",
  GROUP_FULL: 'This group just filled up.',
  GROUP_CLOSED: 'This group has already booked, so it is closed.',
  REQUEST_NOT_PENDING: 'This request was already handled. The list has been refreshed.',
  ALREADY_SAVED: 'Someone in the group already saved this room.',
  ALREADY_BOOKED: 'Your group already has a booking.',
  ALREADY_REVIEWED: "You've already rated this person for this trip.",
  CONFLICT: 'Someone else is making a change right now. Please try again.',
  INTERNAL: 'Something went wrong on the server.',
};

export function errorMessage(e: unknown): string {
  if (!isApiError(e)) return e instanceof Error ? e.message : 'Something went wrong.';
  if (e.code === 'ROOMS_UNAVAILABLE') {
    // The server's line already reads well, e.g. "Only 1 left on 13 Apr; 2 needed".
    const issue = e.details[0]?.issue;
    return issue ? `Not enough rooms: ${issue}. Pick another option.` : e.message;
  }
  // DATES_CONFLICT uses the server's message: it differs for the seeker ("You are already…")
  // and for the owner approving ("This traveller has already…"); errorLines adds the clashing trip.
  return FRIENDLY[e.code] ?? e.message;
}

/** Extra lines worth showing under the headline (failing rules, field issues, the clashing trip). */
export function errorLines(e: unknown): string[] {
  if (!isApiError(e)) return [];
  if (
    e.code === 'VALIDATION_ERROR' || e.code === 'NOT_ELIGIBLE' ||
    e.code === 'OUT_OF_DATA_RANGE' || e.code === 'DATES_CONFLICT'
  ) {
    return e.details.map((d) => d.issue).filter(Boolean);
  }
  return [];
}
