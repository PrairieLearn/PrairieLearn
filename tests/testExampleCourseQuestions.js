var config = require('../lib/config');
const path = require('path');

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
    // FIXME: 'demoAnsiOutput',
    'demoCalculation',
    // FIXME: 'demoCodeEditorAutograded',
    // FIXME: 'demoCodeUploadAutograded',
    // FIXME: 'demoCodeUploadManualGrade',
    'demoCustomElement',
    'demoCustomGradeFunction',
    'demoDynamicGraphs',
    'demoFixedCheckbox',
    'demoMatrixAlgebra',
    'demoMatrixComplexAlgebra',
    'demoRandomCheckbox',
    'demoRandomDataFrame',
    'demoRandomMultipleChoice',
    'demoRandomSymbolic',
    'demoStudentFaces',
    'demoStudentNames',
    'elementCheckbox',
    'elementCode',
    // FIXME: 'elementDrawingCentroid',
    // FIXME: 'elementDrawingCollarRod',
    // FIXME: 'elementDrawingGallery',
    // FIXME: 'elementDrawingGradeVector',
    // FIXME: 'elementDrawingGraphs',
    // FIXME: 'elementDrawingInclinedPlane',
    // FIXME: 'elementDrawingLiftingMechanism',
    // FIXME: 'elementDrawingPulley',
    // FIXME: 'elementDrawingSimpleTutorial',
    // FIXME: 'elementDrawingVMDiagrams',
    // FIXME: 'elementElementCodeDocumentation',
    'elementFileDownload',
    // FIXME: 'elementFileEditor',
    'elementGraph',
    'elementIntegerInput',
    'elementMarkdown',
    'elementMatrixComponentInput',
    'elementMatrixLatex',
    'elementMultipleChoice',
    'elementNumberInput',
    'elementPanels',
    'elementPrairieDrawFigure',
    'elementPythonVariable',
    'elementStringInput',
    // FIXME: 'elementSymbolicInput',
    // FIXME: 'elementThreeJS',
    'elementVariableOutput',
];

describe('Auto-test questions in exampleCourse', function() {
    this.timeout(60000);

    before('set up testing server', helperServer.before(exampleCourseDir));
    after('shut down testing server', helperServer.after);

    qidsExampleCourse.forEach(qid => helperQuestion.autoTestQuestion(locals, qid));
});
