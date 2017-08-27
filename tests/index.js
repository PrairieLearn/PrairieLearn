var logger = require('../lib/logger');
logger.transports.console.level = 'warn';

require('./testDatabase');
require('./testLoadCourse');
require('./testSyncCourseInfo');
require('./testGetHomepage');
require('./testQuestions');
require('./testInstructorQuestions');
require('./testHomework');
require('./testExam');
require('./testAccess');
