var logger = require('../lib/logger');

const consoleTransport = logger.transports.find(transport => (transport.name === 'console'));
consoleTransport.level = 'warn';

const helperDb = require('./helperDb');
const config = require('../lib/config');
config.workersCount = 2; // explicitly use 2 workers to test parallelism
config.fileEditorUseGit = true; // test use of git in file editor

// Root level hooks
before('drop the template database, just in case', helperDb.dropTemplate);
after('drop the template database', helperDb.dropTemplate);

require('./testDatabase');
require('./testLoadCourse');
require('./testSyncCourseInfo');
require('./testFileEditor');
require('./testGetHomepage');
require('./testQuestions');
require('./testInstructorQuestions');
require('./testInstructorAssessment');
require('./testInstructorAssessmentDownloads');
require('./testHomework');
require('./testExam');
require('./testAccess');
require('./testApi');
require('./testZoneGradingHomework');
require('./testZoneGradingExam');
require('./testSproc-check_assessment_access');
require('./testSproc-users_select_or_insert');
require('./testJsonLoad');
require('./testSchemas');
require('./sync');
