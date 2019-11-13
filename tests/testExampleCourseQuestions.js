var config = require('../lib/config');

var helperServer = require('./helperServer');
var helperQuestion = require('./helperQuestion');

const locals = {};

locals.siteUrl = 'http://localhost:' + config.serverPort;
locals.baseUrl = locals.siteUrl + '/pl';
locals.courseInstanceBaseUrl = locals.baseUrl + '/course_instance/1/instructor';
locals.questionBaseUrl = locals.courseInstanceBaseUrl + '/question';
locals.questionsUrl = locals.courseInstanceBaseUrl + '/questions';
locals.isStudentPage = false;

// Link against exampleCourseDir
const exampleCourseDir = path.join(__dirname, '..', 'exampleCourse');


const qidsExampleCourse = [
    'demoCalculation',
    'demoRandomMultipleChoice',
    'demoCustomElement',
    'demoRandomSymbolic',
    'elementFileDownload',
    // FIXME: 'demoCodeEditorAutograded',
    'demoDynamicGraphs',
    'demoMatrixAlgebra',
    'elementCode',
    'demoMatrixComplexAlgebra',
    'elementStringInput',
    'elementMatrixComponentInput',
    'elementPanels',
    // FIXME: 'elementThreeJS',
];

describe('Auto-test questions in exampleCourse', function() {
    this.timeout(60000);

    before('set up testing server', helperServer.before(exampleCourseDir));
    after('shut down testing server', helperServer.after);

    qidsExampleCourse.forEach(qid => helperQuestion.autoTestQuestion(locals, qid));
});
