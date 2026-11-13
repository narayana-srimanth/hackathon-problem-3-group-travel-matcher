// Demo-flow building blocks through the real API: sign up → search → "Interested" → approve.
const FEMALE_SEEKER = Object.freeze({
  age: 26,
  gender: 'FEMALE',
  homeCity: 'Mumbai',
  interests: ['TEMPLES', 'STREET_FOOD', 'ADVENTURE'],
  genderPreference: 'SAME_GENDER',
});

// Priya's search: matches G-01 (Sarah) and G-08
const KYOTO_SEARCH = Object.freeze({
  homeCity: 'Mumbai',
  city: 'Kyoto',
  checkIn: '2027-04-09',
  checkOut: '2027-04-16',
  interests: ['TEMPLES', 'STREET_FOOD', 'ADVENTURE'],
  budgetInr: 62000,
  genderPreference: 'SAME_GENDER',
});

async function signUp(t, name, profile = FEMALE_SEEKER) {
  const res = await t.post('/api/v1/travellers', { ...profile, name });
  if (res.status !== 201) throw new Error(`sign-up failed: ${JSON.stringify(res.body)}`);
  return res.body.traveller.travellerId;
}

// A new traveller who searches, asks to join `groupId`, and is approved by `ownerId` → travellerId
async function joinGroup(t, { groupId, ownerId, name, search = KYOTO_SEARCH }) {
  const id = await signUp(t, name);
  const searchId = (await t.post('/api/v1/searches', search, id)).body.search.searchId;
  const asked = await t.post(`/api/v1/groups/${groupId}/join-requests`, { searchId }, id);
  if (asked.status !== 201) throw new Error(`join request failed: ${JSON.stringify(asked.body)}`);
  const approved = await t.post(
    `/api/v1/join-requests/${asked.body.request.requestId}/approve`,
    undefined,
    ownerId,
  );
  if (approved.status !== 200) throw new Error(`approval failed: ${JSON.stringify(approved.body)}`);
  return id;
}

module.exports = { FEMALE_SEEKER, KYOTO_SEARCH, signUp, joinGroup };
