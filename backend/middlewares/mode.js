var config = require('../config');
var error = require('../error');

module.exports = function(req, res, next) {
    var serverMode = 'Public';
    var clientIP = req.headers['x-forwarded-for'];
    if (!clientIP) {
        clientIP = req.ip;
    }
    if (_(clientIP).isString()) {
        var ipParts = clientIP.split('.');
        if (ipParts.length == 4) {
            try {
                n1 = parseInt(ipParts[0]);
                n2 = parseInt(ipParts[1]);
                n3 = parseInt(ipParts[2]);
                n4 = parseInt(ipParts[3]);
                // Grainger 57
                if (n1 == 192 && n2 == 17 && n3 == 180 && n4 >= 128 && n4 <= 255) {
                    serverMode = 'Exam';
                }
                if (moment.tz("2016-05-06T00:00:01", config.timezone).isBefore()
                    && moment.tz("2016-05-13T23:59:59", config.timezone).isAfter()) {
                    // DCL L520
                    if (n1 == 130 && n2 == 126 && n3 == 246 && n4 >= 36 && n4 <= 76) {
                        serverMode = 'Exam';
                    }
                }
                if (moment.tz("2016-05-09T00:00:01", config.timezone).isBefore()
                    && moment.tz("2016-05-13T23:59:59", config.timezone).isAfter()) {
                    // DCL L440
                    if (n1 == 130 && n2 == 126 && n3 == 246 && n4 == 144) {
                        serverMode = 'Exam';
                    }
                    if (n1 == 130 && n2 == 126 && n3 == 246 && n4 >= 78 && n4 <= 106) {
                        serverMode = 'Exam';
                    }
                }
                if (courseDB.courseInfo.name == "CS 225") {
                    if (n1 == 192 && n2 == 17 && n3 == 11 && n4 >= 82 && n4 <= 117) {
                        serverMode = 'Exam';
                    }
                    if (n1 == 192 && n2 == 17 && n3 == 11 && n4 >= 206 && n4 <= 211) {
                        serverMode = 'Exam';
                    }
                    if (n1 == 192 && n2 == 17 && n3 == 11 && n4 >= 128 && n4 <= 130) {
                        serverMode = 'Exam';
                    }
                    if (n1 == 192 && n2 == 17 && n3 == 11 && n4 == 179) {
                        serverMode = 'Exam';
                    }
                    if (n1 == 192 && n2 == 17 && n3 == 11 && n4 == 60) {
                        serverMode = 'Exam';
                    }
                }
            } catch (e) {}
        }
    }
    req.mode = serverMode;
    next();
};
