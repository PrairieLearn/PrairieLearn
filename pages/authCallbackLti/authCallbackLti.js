const ERR = require('async-stacktrace');
const express = require('express');
const router = express.Router();
const _ = require('lodash');
const oauthSignature = require('oauth-signature');
const debug = require('debug')('prairielearn:authCallbackLti');

const sqldb = require('@prairielearn/prairielib').sqlDb;
const sqlLoader = require('@prairielearn/prairielib').sqlLoader;
const sql = sqlLoader.loadSqlEquiv(__filename);
const error = require('@prairielearn/prairielib').error;
const csrf = require('../../lib/csrf');
const config = require('../../lib/config');
const cache = require('../../lib/cache');

var timeTolerance = 3000; // seconds
var redirUrl;

router.post('/', function(req, res, next) {

    debug(req.body);

    var parameters = _.clone(req.body);
    var signature = req.body.oauth_signature;
    delete parameters.oauth_signature;

    if (parameters.lti_message_type != 'basic-lti-launch-request') {
        return next(error.make(500, 'Unsupported lti_message_type'));
    }

    if (parameters.lti_version != 'LTI-1p0') {
        return next(error.make(500, 'Unsupported lti_version'));
    }

    if (!parameters.oauth_consumer_key) {
        return next(error.make(500, 'Badly formed oauth_consumer_key'));
    }

    if (!parameters.resource_link_id) {
        return next(error.make(500, 'Badly formed resource_link_id'));
    }

    sqldb.queryZeroOrOneRow(sql.lookup_credential, {consumer_key: parameters.oauth_consumer_key}, function(err, result) {
        if (ERR(err, next)) return;
        if (result.rowCount == 0) return next(error.make(500, 'Unknown consumer_key'));

        var ltiresult = result.rows[0];

        var genSignature = oauthSignature.generate('POST', config.ltiRedirectUrl, parameters, ltiresult.secret, null, {encodeSignature: false});
        if (genSignature != signature) {
            return next(error.make(500, 'Invalid signature'));
        }

        // Check oauth_timestamp within N seconds of now (3000 suggested)
        var timeDiff = Math.abs(Math.floor(Date.now()/1000) - parameters.oauth_timestamp);
        if (timeDiff > timeTolerance) {
            return next(error.make(500, 'Invalid timestamp'));
        }

        // Check nonce hasn't been used by that consumer_key in that timeframe
        // https://oauth.net/core/1.0/#nonce
        var nonceReused = false;
        var nonceKey = 'authCallbackLti:' + parameters.oauth_timestamp + ':' + parameters.oauth_nonce;
        cache.get(nonceKey, (err, val) => {
            if (ERR(err, next)) return;
            if (val) {
                nonceReused = true;
            } else {
                cache.set(nonceKey, true, timeTolerance*1000);
            }
        });
        if (nonceReused) return next(error.make(500, 'Invalid nonce reuse'));

        //
        // OAuth validation succeeded, next look up and store user authn data
        //

        debug('lti parameters' + parameters);
        debug('lti sql query ' + ltiresult);

        if (!parameters.user_id) {
            return next(error.make(500, 'Authentication problem: UserID required. Anonymous access disabled.'));
        }

        /* Create unique UID from LTI parameters and CI id
           Not using an email address (parameters.lis_person_contact_email_primary)
           so that LTI doesn't conflict with other UIDs.
        */
        var authUid = parameters.user_id + '@' + parameters.context_id + '::ciid=' + ltiresult.course_instance_id;

        var fallbackName = 'LTI user';
        if (parameters.context_title) {
            fallbackName = `${parameters.context_title} user`;
            // e.g. UIUC Degree Sandbox user
        }
        var authName = parameters.lis_person_name_full || fallbackName;

        var params = [
            authUid,
            authName,
            ltiresult.course_instance_id,
            parameters.user_id,
            parameters.context_id,
        ];

        sqldb.call('users_select_or_insert_lti', params, (err, result) => {
            if (ERR(err, next)) return;
            var tokenData = {
                user_id: result.rows[0].user_id,
                provider: 'lti',
            };
            var pl_authn = csrf.generateToken(tokenData, config.secretKey);
            res.cookie('pl_authn', pl_authn, {maxAge: 24 * 60 * 60 * 1000});

            var role = 'Student'; // default
            if (parameters.roles.includes('TeachingAssistant')) { role = 'TA'; }
            if (parameters.roles.includes('Instructor')) { role = 'Instructor'; }

            var params = {
                course_instance_id: ltiresult.course_instance_id,
                user_id: tokenData.user_id,
                req_date: res.locals.req_date,
                role,
            };

            sqldb.queryZeroOrOneRow(sql.enroll, params, function(err, result) {
                if (ERR(err, next)) return;
                if (result.rowCount == 0) return next(error.make(403, 'Access denied'));

                var params = {
                    course_instance_id: ltiresult.course_instance_id,
                    context_id: parameters.context_id,
                    resource_link_id: parameters.resource_link_id,
                    resource_link_title: parameters.resource_link_title || '',
                    resource_link_description: parameters.resource_link_description || '',
                };
                sqldb.queryOneRow(sql.upsert_current_link, params, function(err, result) {
                    if (ERR(err, next)) return;

                    // Do we have an assessment linked to this resource_link_id?
                    if (result.rows[0].assessment_id && parameters.lis_result_sourcedid) {

                        // Save outcomes here
                        var params = {
                            user_id: tokenData.user_id,
                            assessment_id: result.rows[0].assessment_id,
                            lis_result_sourcedid: parameters.lis_result_sourcedid,
                            lis_outcome_service_url: parameters.lis_outcome_service_url,
                            lti_credential_id: ltiresult.id,
                        };

                        sqldb.query(sql.upsert_outcome, params, function(err, _outcome_result) {
                            if (ERR(err, next)) return;

                                redirUrl = `${res.locals.urlPrefix}/course_instance/${ltiresult.course_instance_id}/assessment/${result.rows[0].assessment_id}/`;
                                res.redirect(redirUrl);
                        });
                    } else {
                        // No linked assessment

                        if (role != 'Student') {
                            redirUrl = `${res.locals.urlPrefix}/course_instance/${ltiresult.course_instance_id}/instructor/admin/lti`;
                        } else {
                            // Show an error that the assignment is unavailable
                            return next(error.make(400, 'Assignment not available yet'));
                        }
                        res.redirect(redirUrl);
                    }
                });
            });
        });
    });
});

module.exports = router;

/*
NOTES:

Coursera doesn't support the launch_presentation_return_url feature so we show errors internally.

redirUrl = parameters.launch_presentation_return_url + '?lti_errorlog=AssessmentLinkMissing';
console.log(redirUrl);


*/
