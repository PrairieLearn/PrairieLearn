var hmacSha256 = require('crypto-js/hmac-sha256');

var config = require('../config');
var error = require('../error');

module.exports = function(req, res, next) {

    // bypass auth for local file serving
    if (config.localFileserver) {
        if (req.path == "/"
            || req.path == "/index.html"
            || req.path == "/version.js"
            || req.path == "/config.js"
            || req.path == "/favicon.png"
            || req.path == "/favicon.ico"
            || /^\/require\//.test(req.path)
            || /^\/css\//.test(req.path)
            || /^\/text\//.test(req.path)
            || /^\/img\//.test(req.path)
            || /^\/MathJax\//.test(req.path)
           ) {
            next();
            return;
        }
    }

    // bypass auth for local /auth serving
    if (config.authType === 'none' && req.path == "/auth") {
        next();
        return;
    }
    
    // bypass auth for local /admin/ and /pl/ serving
    if (config.authType === 'none'
        && (/^\/admin/.test(req.path)
            || /^\/pl/.test(req.path)
            || /^\/images\//.test(req.path)
            || /^\/fonts\//.test(req.path)
            || /^\/javascripts\//.test(req.path)
            || /^\/localscripts\//.test(req.path)
            || /^\/stylesheets\//.test(req.path))) {
        req.authUID = 'user1@illinois.edu';
        req.authName = 'Test User';
        req.authRole = 'Superuser';
        req.mode = 'Public';
        req.userUID = 'user1@illinois.edu';
        req.userRole = 'Superuser';
        next();
        return;
    }
    
    // bypass auth for heartbeat
    if (req.path == "/heartbeat") {
        next();
        return;
    }

    if (req.method === 'OPTIONS') {
        // don't authenticate for OPTIONS requests, as these are just for CORS
        next();
        return;
    }

    if (config.authType == 'x-trust-auth') {
        var authUID = null, authName = null;
        if (req.headers['x-trust-auth-uid']) authUID = req.headers['x-trust-auth-uid'];
        if (req.headers['x-trust-auth-name']) authName = req.headers['x-trust-auth-name'];
        if (!authUID) return next(error.make(403, "No X-Trust-Auth-UID header", {path: req.path}));
        if (!authName) return next(error.make(403, "No X-Trust-Auth-Name header", {path: req.path}));
        req.authUID = authUID;
        req.authName = authName;
        req.userUID = authUID;
    } else if (config.authType == 'eppn' || config.authType == 'x-auth' || config.authType === 'none') {
        var authUID = null, authName = null, authDate = null, authSignature = null, mode = null, userUID = null, userRole = null;
        if (req.cookies.userData) {
            var cookieUserData;
            try {
                cookieUserData = JSON.parse(req.cookies.userData);
            } catch (e) {
                return next(error.make(403, "Error parsing cookies.userData as JSON", {userData: req.cookies.userData}));
            }
            if (cookieUserData.authUID) authUID = cookieUserData.authUID;
            if (cookieUserData.authName) authName = cookieUserData.authName;
            if (cookieUserData.authDate) authDate = cookieUserData.authDate;
            if (cookieUserData.authSignature) authSignature = cookieUserData.authSignature;
            if (cookieUserData.mode) mode = cookieUserData.mode;
            if (cookieUserData.userUID) userUID = cookieUserData.userUID;
            if (cookieUserData.userRole) userRole = cookieUserData.userRole;
        }
        if (req.headers['x-auth-uid']) authUID = req.headers['x-auth-uid'];
        if (req.headers['x-auth-name']) authName = req.headers['x-auth-name'];
        if (req.headers['x-auth-date']) authDate = req.headers['x-auth-date'];
        if (req.headers['x-auth-signature']) authSignature = req.headers['x-auth-signature'];
        if (req.headers['x-mode']) mode = req.headers['x-mode'];
        if (req.headers['x-user-uid']) userUID = req.headers['x-user-uid'];
        if (req.headers['x-user-role']) userRole = req.headers['x-user-role'];

        if (!authUID) return next(error.make(403, "No X-Auth-UID header and no authUID cookie", {path: req.path}));
        if (!authName) return next(error.make(403, "No X-Auth-Name header and no authName cookie", {path: req.path}));
        if (!authDate) return next(error.make(403, "No X-Auth-Date header and no authDate cookie", {path: req.path}));
        if (!authSignature) return next(error.make(403, "No X-Auth-Signature header and no authSignature cookie", {path: req.path}));

        if (!mode) mode = 'Default';
        if (!userUID) userUID = authUID;

        authUID = authUID.toLowerCase();
        userUID = userUID.toLowerCase();

        var checkData = authUID + "/" + authName + "/" + authDate;
        var checkSignature = hmacSha256(checkData, config.secretKey).toString();
        if (authSignature !== checkSignature) return next(error.make(403, "Invalid X-Auth-Signature for " + authUID));

        // authorization succeeded, store data in the request
        req.authUID = authUID;
        req.authName = authName;
        req.authDate = authDate;
        req.authSignature = authSignature;
        req.mode = mode;
        req.userUID = userUID;
    } else {
        return next(error.make(500, "Invalid authType: " + config.authType));
    }
};
