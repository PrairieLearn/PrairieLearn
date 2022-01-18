var logger = require('../lib/logger');

const consoleTransport = logger.transports.find((transport) => transport.name === 'console');
consoleTransport.level = 'warn';

const helperDb = require('./helperDb');
const config = require('../lib/config');
config.workersCount = 2; // explicitly use 2 workers to test parallelism
config.fileEditorUseGit = true; // test use of git in file editor

// Root level hooks
before('drop the template database, just in case', helperDb.dropTemplate);
after('drop the template database', helperDb.dropTemplate);

require('./testDatabase');
require('./testAdministrator');
require('./testAdministratorQueries');
require('./testFileEditor');
require('./testCourseEditor');
require('./testGetHomepage');
require('./testExampleCourseQuestions');
require('./testTestCourseQuestions');
require('./testInstructorQuestions');
require('./testInstructorAssessment');
require('./testInstructorAssessmentDownloads');
require('./testHomework');
require('./testExam');
require('./testGradingMethods');
require('./testRealTimeGradingDisabled');
require('./testShowClosedAssessment');
require('./testShowClosedAssessmentScore');
require('./testActiveAccessRestriction');
require('./testGradeRate');
require('./testBonusPoints');
require('./testAccess');
require('./testAccessAsStudent');
require('./testCourseElementExtension');
require('./testApi');
require('./testLti');
require('./testCron');
require('./testNewsItems');
require('./testZoneGradingHomework');
require('./testZoneGradingExam');
require('./testSproc-check_course_instance_access');
require('./testSproc-check_assessment_access');
require('./testSproc-users_select_or_insert');
require('./testJsonLoad');
require('./testSchemas');
require('./testMarkdown');
require('./testRedirects');
require('./testIssues');
require('./testSequentialQuestions');
require('./testChunks');
require('./testChunkAssessment');
require('./testLocalLock');
require('./testWorkspaceAccess');
require('./sync');
require('./testGroupGenerateAndDelete');
require('./testGroupStudent');
require('./testGroupScoreAndSync');
require('./permissions');
