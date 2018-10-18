var logger = require('../lib/logger');
logger.transports.console.level = 'warn';

const helperDb = require('./helperDb');
const config = require('../lib/config');
config.workersCount = 2; // explicitly use 2 workers to test parallelism

// Root level hooks
before('drop the template database, just in case', helperDb.dropTemplate);
after('drop the template database', helperDb.dropTemplate);

require('./testDatabase');
require('./testLoadCourse');
require('./testSyncCourseInfo');
require('./testGetHomepage');
require('./testQuestions');
require('./testInstructorQuestions');
require('./testInstructorAssessment');
require('./testHomework');
require('./testExam');
require('./testAccess');
require('./testApi');
require('./testZoneGradingHomework');
require('./testZoneGradingExam');
require('./testSproc-check_assessment_access');
