const config = require('../lib/config');
const request = require('request');
const helperServer = require('./helperServer');
const siteUrl = 'http://localhost:' + config.serverPort;
const baseUrl = siteUrl + '/pl';
const courseInstanceUrl = baseUrl + '/course_instance/1';
const assessmentsUrl = courseInstanceUrl + '/assessments';

const storedConfig = {};

describe('Test access with authn as student', function() {
    this.timeout(20000);

    before('set authenticated user', function(callback) {
        storedConfig.authUid = config.authUid;
        storedConfig.authName = config.authName;
        storedConfig.authUin = config.authUin;
        config.authUid = 'student@illinois.edu';
        config.authName = 'Student User';
        config.authUin = '00000001';
        callback(null);
    });
    before('set up testing server', helperServer.before());
    after('shut down testing server', helperServer.after);
    after('unset authenticated user', function(callback) {
        Object.assign(config, storedConfig);
        callback(null);
    });

    describe('The student user', function() {
        it('should not have access to the assessments page', function(callback) {
            request(assessmentsUrl, function (error, response) {
                if (error) {
                    return callback(error);
                }
                // Response should either be an access code error or a redirect to enrollment
                if (response.status_code != '403' && response.path != '/pl/course_instance/1/enroll') {
                    return callback(new Error('Student has access to page other than enrolling: ' + response.path));
                }
                callback(null);
            });
        });
    });
});
