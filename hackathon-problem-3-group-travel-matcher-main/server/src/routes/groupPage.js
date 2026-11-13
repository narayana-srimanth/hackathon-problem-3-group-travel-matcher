const { createRouter } = require('../middleware/params');
const { identify } = require('../middleware/identify');
const { validate } = require('../middleware/validate');
const { hotelsQuery, saveOptionBody } = require('../validators/hotel');
const page = require('../controllers/groupPageController');

const router = createRouter();
const OPTION = '/groups/:groupId/saved-options/:optionId';

router.get('/groups/:groupId/hotels', identify, validate({ query: hotelsQuery }), page.hotels); // E21
router.post('/groups/:groupId/saved-options', identify, validate({ body: saveOptionBody }), page.save); // E22
router.get('/groups/:groupId/saved-options', identify, page.list); // E23
router.delete(OPTION, identify, page.remove); // E24 · saver or owner
router.post(`${OPTION}/vote`, identify, page.vote); // E25
router.delete(`${OPTION}/vote`, identify, page.unvote); // E26

module.exports = router;
