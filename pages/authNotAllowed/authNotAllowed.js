const { Router } = require('express');
const asyncHandler = require('express-async-handler');

const { AuthNotAllowed } = require('./authNotAllowed.html');

const router = Router({ mergeParams: true });

router.get(
  '/',
  asyncHandler(async (req, res) => {
    res.send(AuthNotAllowed({ resLocals: res.locals }));
  })
);

module.exports = router;
