const ERR = require('async-stacktrace');
const express = require('express');
const router = express.Router();
const opsbot = require('../../lib/opsbot');
const github = require('../../lib/github');
const logger = require('../../lib/logger');
const config = require('../../lib/config.js');
const path = require('path');

const sqldb = require('../../prairielib/lib/sql-db');
const sqlLoader = require('../../prairielib/lib/sql-loader');
const sql = sqlLoader.loadSqlEquiv(__filename);

function get(req, res, next) {
  sqldb.query(sql.get_requests, { user_id: res.locals.authn_user.user_id }, (err, result) => {
    if (ERR(err, next)) return;

    res.locals.course_requests = result.rows;
    res.render(__filename.replace(/\.js$/, '.ejs'), res.locals);
  });
}

router.get('/', get);

router.post('/', function (req, res, next) {
  const short_name = req.body['cr-shortname'].toUpperCase() || '';
  const title = req.body['cr-title'] || '';
  const github_user = req.body['cr-ghuser'] || null;
  const first_name = req.body['cr-firstname'] || '';
  const last_name = req.body['cr-lastname'] || '';
  const work_email = req.body['cr-email'] || '';
  const institution = req.body['cr-institution'] || '';

  if (!short_name.match(/[A-Z]+ [A-Z0-9]+/)) {
    res.locals.error_message =
      'The course rubric and number should be a series of letters, followed by a space, followed by a series of numbers and/or letters.';
    return next();
  }
  if (title.length < 1) {
    res.locals.error_message = 'The course title should not be empty.';
    return next();
  }
  if (first_name.length < 1) {
    res.locals.error_message = 'The first name should not be empty.';
    return next();
  }
  if (last_name.length < 1) {
    res.locals.error_message = 'The last name should not be empty.';
    return next();
  }
  if (work_email.length < 1) {
    res.locals.error_message = 'The work email should not be empty.';
    return next();
  }
  if (institution.length < 1) {
    res.locals.error_message = 'The institution should not be empty.';
    return next();
  }

  sqldb.queryOneRow(
    sql.get_existing_course_requests,
    { user_id: res.locals.authn_user.user_id, short_name, title },
    (err, result) => {
      if (ERR(err, next)) return;
      if (result.rows[0].has_existing_request) {
        res.locals.error_message = `<p> You already have a request for this course. </p>`;
        return next();
      }

      sqldb.query(
        sql.get_conflicting_course_owners,
        { short_name: short_name.trim().toLowerCase() },
        (err, result) => {
          if (ERR(err, next)) return;
          const course_owners = result.rows;

          if (course_owners.length > 0) {
            /* If the course already exists, display an error message containing the owners */

            let error_message = `<p>The requested course (${short_name}) already exists.  Please contact the owner(s) of that course to request access to it.</p>`;
            let formatted_owners = [];
            course_owners.forEach((c) => {
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
              formatted_owners.forEach((o) => {
                error_message += '<li>' + o + '</li>';
              });
              error_message += '</ul>';
            }
            res.locals.error_message = error_message;
            next();
          } else {
            /* Otherwise, insert the course request and send a Slack message */

            const sql_params = [
              res.locals.authn_user.user_id,
              short_name,
              title,
              github_user,
              first_name,
              last_name,
              work_email,
              institution,
            ];
            sqldb.call('course_requests_insert', sql_params, (err, result) => {
              if (ERR(err, next)) return;
              const auto_created = result.rows[0].auto_created;
              const creq_id = result.rows[0].course_request_id;

              if (auto_created) {
                /* Automatically fill in institution id and display timezone from the user's other courses */
                sqldb.queryOneRow(
                  sql.get_existing_owner_course_settings,
                  { user_id: res.locals.authn_user.user_id },
                  (err, result) => {
                    if (ERR(err, next)) return;
                    const repo_short_name = github.reponameFromShortname(short_name);
                    const repo_options = {
                      short_name: short_name,
                      title: title,
                      institution_id: result.rows[0].institution_id,
                      display_timezone: result.rows[0].display_timezone,
                      path: path.join(config.coursesRoot, repo_short_name),
                      repo_short_name: repo_short_name,
                      github_user,
                      course_request_id: creq_id,
                    };
                    github.createCourseRepoJob(repo_options, res.locals.authn_user, (err, _job) => {
                      if (
                        ERR(err, () => {
                          logger.error(err);
                        })
                      ) {
                        return;
                      }

                      /* Ignore the callback, we don't actually care if the message gets sent before we render the page */
                      opsbot.sendCourseRequestMessage(
                        `*Automatically creating course*\n` +
                          `Course repo: ${repo_short_name}\n` +
                          `Course rubric: ${short_name}\n` +
                          `Course title: ${title}\n` +
                          `Requested by: ${first_name} ${last_name} (${work_email})\n` +
                          `Logged in as: ${res.locals.authn_user.name} (${res.locals.authn_user.uid})\n` +
                          `GitHub username: ${github_user || 'not provided'}`,
                        (err) => {
                          ERR(err, () => {
                            logger.error(err);
                          });
                        }
                      );

                      /* Redirect on success so that refreshing doesn't create another request */
                      res.redirect(req.originalUrl);
                    });
                  }
                );
              } else {
                /* Not automatically created */
                opsbot.sendCourseRequestMessage(
                  `*Incoming course request*\n` +
                    `Course rubric: ${short_name}\n` +
                    `Course title: ${title}\n` +
                    `Requested by: ${first_name} ${last_name} (${work_email})\n` +
                    `Logged in as: ${res.locals.authn_user.name} (${res.locals.authn_user.uid})\n` +
                    `GitHub username: ${github_user || 'not provided'}`,
                  (err) => {
                    ERR(err, () => {
                      logger.error(err);
                    });
                  }
                );
                res.redirect(req.originalUrl);
              }
            });
          }
        }
      );
    }
  );
});
router.post('/', get);

module.exports = router;
