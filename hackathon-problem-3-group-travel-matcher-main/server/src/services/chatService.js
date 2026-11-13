// Group chat (E33, E34): members of a group message each other to plan the trip.
// Members only — the owner and approved members; pending seekers and outsiders get 403.
// The client polls with ?after=<last messageId>, so each poll returns only what's new.
const { Message, Traveller } = require('../models');
const { nextId } = require('../db/counters');
const { toMessage } = require('../dto/message');
const { findGroupForMember } = require('./groupService');

const seqOf = (messageId) => Number(messageId.slice('MSG-'.length));

// messages → DTOs with each sender's name (one query)
async function withSenders(messages) {
  const ids = [...new Set(messages.map((m) => m.senderId))];
  const people = ids.length
    ? await Traveller.find({ travellerId: { $in: ids } }, { _id: 0, travellerId: 1, name: 1 }).lean()
    : [];
  const byId = new Map(people.map((p) => [p.travellerId, p]));
  return messages.map((m) => toMessage(m, byId.get(m.senderId)));
}

// E33
async function sendMessage(groupId, actorId, { body }) {
  await findGroupForMember(groupId, actorId); // 404 unknown group, 403 not a member
  const messageId = await nextId('message');
  const created = await Message.create({ messageId, seq: seqOf(messageId), groupId, senderId: actorId, body });
  const [message] = await withSenders([created.toObject()]);
  return { message };
}

// E34 → { items (oldest first), hasMore }
//   hasMore: older messages exist (latest / before), or newer ones are still waiting (after)
async function listMessages(groupId, actorId, { after, before, limit }) {
  await findGroupForMember(groupId, actorId);
  const filter = { groupId };
  if (after) filter.seq = { $gt: seqOf(after) };
  if (before) filter.seq = { $lt: seqOf(before) };

  // One extra row tells us whether there is more beyond this page
  const rows = await Message.find(filter, { _id: 0 })
    .sort({ seq: after ? 1 : -1 })
    .limit(limit + 1)
    .lean();
  const hasMore = rows.length > limit;
  const page = rows.slice(0, limit);
  if (!after) page.reverse(); // always oldest first
  return { items: await withSenders(page), hasMore };
}

module.exports = { sendMessage, listMessages };
