// Everything under /api/v1. Each feature's routes live in their own file.
const express = require('express');

const router = express.Router();

router.use(require('./health')); // E01
router.use(require('./meta')); // E02–E03
router.use(require('./travellers')); // E04–E07

module.exports = router;
