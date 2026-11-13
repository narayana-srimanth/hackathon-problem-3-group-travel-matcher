// Group chat (E33, E34)
const { asyncHandler } = require('../middleware/asyncHandler');
const chat = require('../services/chatService');

module.exports = {
  // E33 · POST /groups/:groupId/messages
  send: asyncHandler(async (req, res) =>
    res.status(201).json(await chat.sendMessage(req.params.groupId, req.actorId, req.body)),
  ),

  // E34 · GET /groups/:groupId/messages
  list: asyncHandler(async (req, res) =>
    res.json(await chat.listMessages(req.params.groupId, req.actorId, req.query)),
  ),
};
