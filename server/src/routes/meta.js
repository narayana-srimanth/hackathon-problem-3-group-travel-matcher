const { createRouter } = require('../middleware/params');
const meta = require('../controllers/metaController');

const router = createRouter();

router.get('/meta/interests', meta.interests); // E02 · Auth: none
router.get('/meta/destinations', meta.destinations); // E03 · Auth: none

module.exports = router;
