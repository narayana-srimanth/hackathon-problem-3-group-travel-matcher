const { createRouter } = require('../middleware/params');
const { identify } = require('../middleware/identify');
const { validate } = require('../middleware/validate');
const { bookingBody } = require('../validators/booking');
const booking = require('../controllers/bookingController');

const router = createRouter();

router.post('/groups/:groupId/booking/quote', identify, validate({ body: bookingBody }), booking.quote); // E27
router.post('/groups/:groupId/booking', identify, validate({ body: bookingBody }), booking.book); // E28 · any member
router.get('/groups/:groupId/booking', identify, booking.get); // E29

module.exports = router;
