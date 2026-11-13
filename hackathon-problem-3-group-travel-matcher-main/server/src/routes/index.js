// Everything under /api/v1. Each feature's routes live in their own file.
const express = require('express');

const router = express.Router();

router.use(require('./health')); // E01
router.use(require('./meta')); // E02–E03
router.use(require('./travellers')); // E04–E07
router.use(require('./groups')); // E08–E10
router.use(require('./searches')); // E11–E14
router.use(require('./joinRequests')); // E15–E20
router.use(require('./groupPage')); // E21–E26
router.use(require('./booking')); // E27–E29
router.use(require('./reviews')); // E30–E32
router.use(require('./chat')); // E33–E34

module.exports = router;
