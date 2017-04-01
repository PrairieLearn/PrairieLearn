var logger = require('../lib/logger');
logger.transports.console.level = 'warn';

require('./testLoadCourse');
require('./testSyncCourseInfo');
require('./testGetHomepage');
require('./testHomework');
require('./testExam');
require('./testAccess');
