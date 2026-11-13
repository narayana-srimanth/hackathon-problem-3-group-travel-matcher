const { createRouter } = require('../middleware/params');
const { identify } = require('../middleware/identify');
const { validate } = require('../middleware/validate');
const { reviewBody, reviewsQuery } = require('../validators/review');
const reviews = require('../controllers/reviewController');

const router = createRouter();

router.post('/groups/:groupId/reviews', identify, validate({ body: reviewBody }), reviews.create); // E30 · member, after check-out
router.get('/groups/:groupId/reviews', identify, reviews.groupStatus); // E31 · member
router.get('/travellers/:travellerId/reviews', identify, validate({ query: reviewsQuery }), reviews.forTraveller); // E32 · any traveller

module.exports = router;
