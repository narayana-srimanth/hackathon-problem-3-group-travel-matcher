const { createRouter } = require('../middleware/params');
const { identify } = require('../middleware/identify');
const { validate } = require('../middleware/validate');
const { createJoinRequestBody, groupRequestsQuery, myRequestsQuery } = require('../validators/joinRequest');
const requests = require('../controllers/joinRequestController');

const router = createRouter();

router.post(
  '/groups/:groupId/join-requests',
  identify,
  validate({ body: createJoinRequestBody }),
  requests.create,
); // E15 · not owner, not member
router.get(
  '/groups/:groupId/join-requests',
  identify,
  validate({ query: groupRequestsQuery }),
  requests.listForGroup,
); // E16 · owner
router.get('/me/join-requests', identify, validate({ query: myRequestsQuery }), requests.listMine); // E17
router.post('/join-requests/:requestId/approve', identify, requests.approve); // E18 · owner
router.post('/join-requests/:requestId/reject', identify, requests.reject); // E19 · owner
router.post('/join-requests/:requestId/withdraw', identify, requests.withdraw); // E20 · seeker

module.exports = router;
