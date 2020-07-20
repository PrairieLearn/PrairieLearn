const ERR = require('async-stacktrace');
const express = require('express');
const _ = require('lodash');
const router = express.Router();
const opsbot = require('../../lib/opsbot');
const github = require('../../lib/github');
const logger = require('../../lib/logger');

const sqldb = require('@prairielearn/prairielib/sql-db');
const sqlLoader = require('@prairielearn/prairielib/sql-loader');
const sql = sqlLoader.loadSqlEquiv(__filename);

function get(req, res, next)  {
    sqldb.query(sql.get_requests, {user_id: res.locals.authn_user.user_id}, (err, result) => {
        if (ERR(err, next)) return;

        res.locals.course_requests = result.rows;
        res.render(__filename.replace(/\.js$/, '.ejs'), res.locals);
    });
}

router.get('/', get);

router.post('/', function(req, res, next) {
    const short_name = req.body['cr-shortname'].toUpperCase() || '';
    const title = req.body['cr-title'] || '';
    const github_user = req.body['cr-ghuser'] || null;

    if (!short_name.match(/[A-Z]+ [A-Z0-9]+/)) {
        res.locals.error_message = 'The course rubric and number should be a series of letters, followed by a space, followed by a series of numbers and/or letters.';
        return next();
    }
    if (title.length < 1) {
        res.locals.error_message = 'The course title should not be empty.';
        return next();
    }

    sqldb.query(sql.get_conflicting_course_owners, { 'short_name': short_name.trim().toLowerCase() }, (err, result) => {
        if (ERR(err, next)) return;
        const course_owners = result.rows;

        if (course_owners.length > 0) {
            let error_message = `<p>The requested course (${short_name}) already exists.  Please contact the owner(s) of that course to request access to it.</p>`;
            let formatted_owners = [];
            course_owners.forEach(c => {
                if (c.name !== null && c.uid !== null) {
                    formatted_owners.push(`${c.name} (<code>${c.uid}</code>)`);
                } else if (c.name !== null) {
                    formatted_owners.push(c.name);
                } else if (c.uid !== null) {
                    formatted_owners.push(`<code> ${c.uid} </code>`);
                }
            });
            if (formatted_owners.length > 0) {
                error_message += '<ul>';
                formatted_owners.forEach(o => {
                    error_message += '<li>' + o + '</li>';
                });
                error_message += '</ul>';
            }
            res.locals.error_message = error_message;
            next();
        } else {
            const sql_params = [
                res.locals.authn_user.user_id,
                short_name,
                title,
                github_user,
            ];
            sqldb.call('course_requests_insert', sql_params, (err, result) => {
                if (ERR(err, next)) return;
                const auto_created = result.rows[0].auto_created;
                const creq_id = result.rows[0].course_request_id;

                /* Ignore the callback, we don't actually care if the message gets sent before we render the page */
                if (auto_created) {
                    github.createAndAddCourseFromRequest(creq_id, res.locals.authn_user, (err, repo) => {
                        if (ERR(err, (e) => {logger.error(err);})) return;

                        opsbot.sendCourseRequestMessage(
                            `*Automatically created course*\n` +
                            `Course repo: ${repo}\n` +
                            `Course rubric: ${short_name}\n` +
                            `Course title: ${title}\n` +
                            `Requested by: ${res.locals.authn_user.name} (${res.locals.authn_user.uid})\n` +
                            `GitHub username: ${github_user || 'not provided'}`, (err) => {
                                ERR(err, (e) => {logger.error(err);});
                            });
                    });
                } else {
                    opsbot.sendCourseRequestMessage(
                        `*Incoming Course Request*\n` +
                        `Course rubric: ${short_name}\n` +
                        `Course title: ${title}\n` +
                        `Requested by: ${res.locals.authn_user.name} (${res.locals.authn_user.uid})\n` +
                        `GitHub username: ${github_user || 'not provided'}`, (err) => {
                            ERR(err, (e) => {logger.error(err);});
                        });
                }
                next();
            });
        }
    });
});
router.post('/', get);

module.exports = router;
