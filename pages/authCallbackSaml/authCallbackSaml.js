const ERR = require('async-stacktrace');
const express = require('express');
const passport = require('passport');

const router = express.Router({ mergeParams: true });

router.post('/', (req, res, next) => {
  passport.authenticate('saml', { response: res, failureRedirect: '/pl', session: false })(
    req,
    res,
    (err) => {
      if (ERR(err, next)) return;

      if (req.body.RelayState === 'test') {
        // TODO: render an HTML page that explains what is being shown (the
        // attributes from the SAML response).
        res.contentType('application/json');
        res.send(JSON.stringify(req.user.attributes, null, 2));
        res.json(req.user.attributes);
        return;
      }

      // TODO: create user and set cookie.

      let redirUrl = res.locals.homeUrl;
      if ('preAuthUrl' in req.cookies) {
        redirUrl = req.cookies.preAuthUrl;
        res.clearCookie('preAuthUrl');
      }
      res.redirect(redirUrl);
    }
  );
});

module.exports = router;
