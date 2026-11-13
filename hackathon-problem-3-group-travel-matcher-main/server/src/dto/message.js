// Message (spec §4)
const { toIso } = require('../utils/text');

// sender: the traveller document (or undefined if they no longer exist)
const toMessage = (m, sender) => ({
  messageId: m.messageId,
  groupId: m.groupId,
  sender: { travellerId: m.senderId, name: sender ? sender.name : null },
  body: m.body,
  createdAt: toIso(m.createdAt),
});

module.exports = { toMessage };
