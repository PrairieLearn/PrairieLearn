const config = require('../lib/config');
const request = require('request');
const helperServer = require('./helperServer');
const siteUrl = 'http://localhost:' + config.serverPort;
const baseUrl = siteUrl + '/pl';
const courseInstanceUrl = baseUrl + '/course_instance/1';
const assessmentsUrl = courseInstanceUrl + '/assessments';

config.authUid = 'student@illinois.edu';
config.authName = 'Student User';
config.authUin = '00000001';

describe('Test access with authn as student', function() {
    this.timeout(20000);

    before('set up testing server', helperServer.before());
    after('shut down testing server', helperServer.after);

    describe('The student user', function() {
        it('should not have access to the assessments page', function(callback) {
            request(assessmentsUrl, function (error, response) {
                if (error) {
                    return callback(error);
                }
                if (response.statusCode != 403) {
                    return callback(new Error('bad status: ' + response.statusCode));
                }
                callback(null);
            });
        });
    });
});
