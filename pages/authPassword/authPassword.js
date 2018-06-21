//var ERR = require('async-stacktrace');
var express = require('express');
var router = express.Router();

var csrf = require('../../lib/csrf');
var config = require('../../lib/config');

router.get('/', function(req, res) {

    res.locals.passwordInvalid = 'pl_assessmentpw' in req.cookies;
    res.render(__filename.replace(/\.js$/, '.ejs'), res.locals);
});

router.post('/', function(req, res) {

    if (req.body.__action == 'assessmentPassword') {

        var pl_pw_origUrl = req.cookies.pl_pw_origUrl;
        var maxAge = 1000 * 60 * 60 * 12; // 12 hours

        var pwCookie = csrf.generateToken({password: req.body.password, maxAge: maxAge}, config.secretKey);
        res.cookie('pl_assessmentpw', pwCookie, {maxAge: maxAge});
        res.clearCookie('pl_pw_origUrl');
        return res.redirect(pl_pw_origUrl);
    }

});
module.exports = router;
