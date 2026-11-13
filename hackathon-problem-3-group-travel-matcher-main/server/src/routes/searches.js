const { createRouter } = require('../middleware/params');
const { identify } = require('../middleware/identify');
const { validate } = require('../middleware/validate');
const { createSearchBody, matchesQuery } = require('../validators/search');
const searches = require('../controllers/searchController');

const router = createRouter();

router.post('/searches', identify, validate({ body: createSearchBody }), searches.create); // E11
router.get('/searches/:searchId', identify, searches.get); // E12 · search owner
router.get('/searches/:searchId/matches', identify, validate({ query: matchesQuery }), searches.matches); // E13
router.get('/searches/:searchId/groups/:groupId/evaluation', identify, searches.evaluation); // E14

module.exports = router;
