//var ERR = require('async-stacktrace');
var express = require('express');
var router = express.Router();
var _ = require('lodash');

var oauthSignature = require('oauth-signature');

var csrf = require('../../lib/csrf');
var config = require('../../lib/config');

var error = require('@prairielearn/prairielib').error;

router.all('/', function(req, res, next) {

    //console.log(res);

    //console.log(req.hostname);
    console.log(req.body);

    var url = 'http://endeavour.engr.illinois.edu:8009/pl/lti';

    var parameters = _.clone(req.body);
    var signature = req.body.oauth_signature;
    delete parameters.oauth_signature;

    // clone solves this for us
    // https://github.com/expressjs/express/issues/3264#issuecomment-290482333
    //Object.setPrototypeOf(parameters, {});

    var genSignature = oauthSignature.generate('POST', url, parameters, 'secret', null, { encodeSignature: false});

    if (genSignature != signature) {
        return next(error.make(500, 'Invalid signature'));
    }

    if (parameters.lti_message_type != 'basic-lti-launch-request') {
        return next(error.make(500, 'Unsupported lti_message_type'));
    }

    var tokenData = {
        user_id: 5,
    };

    var pl_authn = csrf.generateToken(tokenData, config.secretKey);
    res.cookie('pl_authn', pl_authn, {maxAge: 24 * 60 * 60 * 1000});
    res.redirect(res.locals.homeUrl);
    //res.send('Gotcha');
});

module.exports = router;
