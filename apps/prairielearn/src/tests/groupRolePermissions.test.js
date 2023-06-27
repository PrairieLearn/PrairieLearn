const assert = require('chai').assert;
const cheerio = require('cheerio');
const fetch = require('node-fetch').default;
const fs = require('fs-extra');
const path = require('path');
const { step } = require('mocha-steps');
const tmp = require('tmp-promise');
const util = require('util');

const { config } = require('../lib/config');
const sqldb = require('@prairielearn/postgres');
const sql = sqldb.loadSqlEquiv(__filename);
const { syncCourseData } = require('./sync/util');

const helperServer = require('./helperServer');
const { URLSearchParams } = require('url');
const { TEST_COURSE_PATH } = require('../lib/paths');

let elemList;
const locals = {};
locals.helperClient = require('./helperClient');
locals.siteUrl = 'http://localhost:' + config.serverPort;
locals.baseUrl = locals.siteUrl + '/pl';
locals.courseInstanceUrl = locals.baseUrl + '/course_instance/1';
locals.assessmentsUrl = locals.courseInstanceUrl + '/assessments';
locals.courseDir = TEST_COURSE_PATH;

const storedConfig = {};

describe('Test group role functionality within assessments', function () {
    this.timeout(20000);

    before('set authenticated user', function () {
      storedConfig.authUid = config.authUid;
      storedConfig.authName = config.authName;
      storedConfig.authUin = config.authUin;
    });

    before('set up testing server', async function () {
        await util.promisify(helperServer.before(locals.courseDir).bind(this))();

        // Find the ID of an assessment that has group roles
        const assessmentResults = await sqldb.queryOneRowAsync(sql.select_assessment, {
            tid: 'hw5-templateGroupWork',
          });
        locals.assessmentId = assessmentResults.rows[0].id;
        locals.assessmentUrl = locals.courseInstanceUrl + '/assessment/' + locals.assessmentId;
    });

    after('shut down testing server', helperServer.after);

    after('unset authenticated user', function () {
      Object.assign(config, storedConfig);
    });
});