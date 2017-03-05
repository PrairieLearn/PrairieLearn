var logger = require('../lib/logger');
logger.transports.console.level = 'warn';

require('./loadCourse.js');
require('./syncCourseInfo.js');
require('./getHomepage.js');
require('./doHomework.js');
require('./doExam.js');
