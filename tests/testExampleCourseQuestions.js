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
    'demoAnsiOutput',
    'demoCalculation',
    // FIXME: 'demoCodeEditorAutograded',
    'demoCodeUploadAutograded',
    'demoCodeUploadManualGrade',
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
    'elementDrawingCentroid',
    'elementDrawingCollarRod',
    'elementDrawingGallery',
    'elementDrawingGradeVector',
    'elementDrawingGraphs',
    'elementDrawingInclinedPlane',
    'elementDrawingLiftingMechanism',
    'elementDrawingPulley',
    'elementDrawingSimpleTutorial',
    'elementDrawingVMDiagrams',
    'elementElementCodeDocumentation',
    'elementFileDownload',
    'elementFileEditor',
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
    'elementSymbolicInput',
    // FIXME: 'elementThreeJS',
    'elementVariableOutput'
];

describe('Auto-test questions in exampleCourse', function() {
    this.timeout(60000);

    before('set up testing server', helperServer.before(exampleCourseDir));
    after('shut down testing server', helperServer.after);

    qidsExampleCourse.forEach(qid => helperQuestion.autoTestQuestion(locals, qid));
});
