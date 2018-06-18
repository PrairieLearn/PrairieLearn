//var ERR = require('async-stacktrace');
var express = require('express');
var router = express.Router();

var csrf = require('../../lib/csrf');
var config = require('../../lib/config');

router.get('/', function(req, res, next) {

    res.locals.passwordInvalid = 'pl_assessmentpw' in req.cookies;
    res.render(__filename.replace(/\.js$/, '.ejs'), res.locals);
});

router.post('/', function(req, res, next) {

    if (req.body.__action == 'assessmentPassword') {

        var pl_pw_origUrl = req.cookies.pl_pw_origUrl;

        var pwCookie = csrf.generateToken({password: req.body.password}, config.secretKey);
        res.cookie('pl_assessmentpw', pwCookie);
        res.clearCookie('pl_pw_origUrl');
        return res.redirect(req.cookies.pl_pw_origUrl);
    }

});
module.exports = router;
