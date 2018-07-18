var ERR = require('async-stacktrace');
var express = require('express');
var router = express.Router();
var _ = require('lodash');
var oauthSignature = require('oauth-signature');
var cacheBase = require('cache-base');

var sqldb = require('@prairielearn/prairielib').sqlDb;
var sqlLoader = require('@prairielearn/prairielib').sqlLoader;
var csrf = require('../../lib/csrf');
var config = require('../../lib/config');
var error = require('@prairielearn/prairielib').error;

var timeTolerance = 3000; // seconds

var sql = sqlLoader.loadSqlEquiv(__filename);
var nonceCache = new cacheBase();
var redirUrl;

router.post('/', function(req, res, next) {

    //console.log(res);

    //console.log(req.hostname);
    console.log(req.body);

    // TODO auto-generate this URL, or get from a config variable
    var url = 'http://endeavour.engr.illinois.edu:8009/pl/lti';

    var parameters = _.clone(req.body);
    var signature = req.body.oauth_signature;
    delete parameters.oauth_signature;

    // clone solves this for us
    // https://github.com/expressjs/express/issues/3264#issuecomment-290482333
    //Object.setPrototypeOf(parameters, {});


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

        var genSignature = oauthSignature.generate('POST', url, parameters, ltiresult.secret, null, {encodeSignature: false});
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
        var nonceKey = parameters.oauth_timestamp + ":" + parameters.oauth_nonce;
        if (nonceCache.get(nonceKey)) {
            return next(error.make(500, 'Invalid nonce reuse'));
        } else {
            nonceCache.set(nonceKey, true);
        }

        var authUin = parameters.user_id + '@' + parameters.context_id;
        var authName = parameters.lis_person_name_full || '';
        var authUid = parameters.lis_person_contact_email_primary || authUin;

        var params = [
        authUid,
        authName,
        authUin,
        'lti', //'LTI-ci-' + ltiresult.course_instance_id,
        ];

        sqldb.call('users_select_or_insert', params, (err, result) => {
            if (ERR(err, next)) return;
            var tokenData = {
                user_id: result.rows[0].user_id,
                /*
                lti_launch_presentation_return_url: parameters.launch_presentation_return_url,
                resource_link_id: parameters.resource_link_id,
                resource_link_title: parameters.resource_link_title,
                resource_link_description: parameters.resource_link_description,
                context_id: parameters.context_id,
                context_label: parameters.context_label,
                context_title: parameters.context_title,
                */
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

            sqldb.queryOneRow(sql.enroll, params, function(err, _result) {
                if (ERR(err, next)) return;

                var params = {
                    course_instance_id: ltiresult.course_instance_id,
                    context_id: parameters.context_id,
                    resource_link_id: parameters.resource_link_id,
                    resource_link_title: parameters.resource_link_title || '',
                    resource_link_description: parameters.resource_link_description || '',
                }
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
                        };

                        sqldb.query(sql.upsert_outcome, params, function(err, outcome_result) {
                            if (ERR(err, next)) return;

                                redirUrl = `${res.locals.urlPrefix}/course_instance/${ltiresult.course_instance_id}/assessment/${result.rows[0].assessment_id}/`;
                                res.redirect(redirUrl);
                        });
                    } else {
                        // No linked assessment

                        if (role != 'Student') {
                            redirUrl = `${res.locals.urlPrefix}/course_instance/${ltiresult.course_instance_id}/instructor/lti`;
                        } else {
                            // Default them into the course instance
                            redirUrl = res.locals.urlPrefix + '/course_instance/' + ltiresult.course_instance_id;
                        }
                        res.redirect(redirUrl);
                    }
                });
            });
        });
    });
});

module.exports = router;

function ltiError() {

    //        res.redirect(parameters.launch_presentation_return_url + "?lti_errorlog=Foobar");
    //        return;


}

/*
TODO: expire out the cached nonce, use redis?

permissions for not being able to add other courses via LTI?



*/
