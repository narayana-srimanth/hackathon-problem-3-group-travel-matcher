const mongoose = require('mongoose');
const { USER_DATA } = require('./options');
const { CHAT } = require('../domain/constants');

// One chat message in a group. Members only (see chatService).
const messageSchema = new mongoose.Schema(
  {
    messageId: { type: String, required: true }, // MSG-1001+
    // The number in messageId. The id counter is atomic and global, so seq is the exact send
    // order (no createdAt ties) and the after/before cursors are plain number comparisons.
    seq: { type: Number, required: true },
    groupId: { type: String, required: true },
    senderId: { type: String, required: true },
    body: { type: String, required: true, maxlength: CHAT.BODY_MAX },
  },
  USER_DATA,
);
messageSchema.index({ messageId: 1 }, { unique: true });
messageSchema.index({ groupId: 1, seq: -1 }); // a group's messages, newest first, and both cursors

module.exports = mongoose.model('Message', messageSchema, 'messages');
