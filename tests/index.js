var logger = require('../lib/logger');
logger.transports.console.level = 'warn';

const config = require('../lib/config');
config.workersCount = 2; // explicitly use 2 workers to test parallelism

/*
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
require('./testZoneGradingHomework');
require('./testZoneGradingExam');
*/
require('./testSprocs');
