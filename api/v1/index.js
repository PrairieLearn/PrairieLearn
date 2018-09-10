const express = require('express');
const router = express.Router();

// Pretty-print all JSON responses
router.use(require('./prettyPrintJson'));

// ROUTES
router.get('/test', require('./test/test'));

// If no earlier routes matched, 404 the route
router.use(require('./notFound'));

// Handle errors independently from the normal PL eror handling
router.use(require('./error'));

module.exports = router;