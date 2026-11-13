const { createRouter } = require('../middleware/params');
const { identify } = require('../middleware/identify');
const { validate } = require('../middleware/validate');
const { messageBody, messagesQuery } = require('../validators/chat');
const chat = require('../controllers/chatController');

const router = createRouter();

router.post('/groups/:groupId/messages', identify, validate({ body: messageBody }), chat.send); // E33 · member
router.get('/groups/:groupId/messages', identify, validate({ query: messagesQuery }), chat.list); // E34 · member

module.exports = router;
