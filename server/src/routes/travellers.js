const { createRouter } = require('../middleware/params');
const { identify } = require('../middleware/identify');
const { validate } = require('../middleware/validate');
const { signUpBody, listTravellersQuery } = require('../validators/traveller');
const travellers = require('../controllers/travellerController');

const router = createRouter();

router.post('/travellers', validate({ body: signUpBody }), travellers.signUp); // E04 · Auth: none
router.get('/travellers', validate({ query: listTravellersQuery }), travellers.list); // E05 · Auth: none
router.get('/travellers/:travellerId', identify, travellers.profile); // E06 · Auth: traveller
router.get('/me', identify, travellers.me); // E07 · Auth: traveller (self)

module.exports = router;
