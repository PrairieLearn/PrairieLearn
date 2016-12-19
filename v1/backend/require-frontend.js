/**
 * Require frontend modules.
 *
 * Note: Do not use to require backend modules, as they should be CommonJS
 * modules and not AMD modules.
 */
var config = require("./config");
var logger = require("./logger");
var requirejs = require("requirejs");

requirejs.config({
    nodeRequire: require,
    baseUrl: config.requireDir,
    paths: {
        clientCode: config.relativeClientCodeDir,
        serverCode: config.relativeServerCodeDir,
    },
});

requirejs.onError = function(err) {
    var data = {errorMsg: err.toString()};
    for (var e in err) {
        if (err.hasOwnProperty(e)) {
            data[e] = String(err[e]);
        }
    }
    logger.error("requirejs load error", data);
};

module.exports = requirejs;
