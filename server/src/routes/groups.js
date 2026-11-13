const { createRouter } = require('../middleware/params');
const { identify } = require('../middleware/identify');
const { validate } = require('../middleware/validate');
const { createGroupBody } = require('../validators/group');
const groups = require('../controllers/groupController');

const router = createRouter();

// identify runs before validate, so a missing identity is 401 even with a bad body
router.post('/groups', identify, validate({ body: createGroupBody }), groups.create); // E08 · actor becomes owner
router.get('/groups/:groupId', identify, groups.get); // E09 · any signed-in traveller
router.get('/me/groups', identify, groups.mine); // E10 · self

module.exports = router;
