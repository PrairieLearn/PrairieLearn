var config = require('../lib/config');
const path = require('path');

var helperServer = require('./helperServer');
var helperQuestion = require('./helperQuestion');

const locals = {};

locals.siteUrl = 'http://localhost:' + config.serverPort;
locals.baseUrl = locals.siteUrl + '/pl';
locals.courseInstanceBaseUrl = locals.baseUrl + '/course_instance/1/instructor';
locals.questionBaseUrl = locals.courseInstanceBaseUrl + '/question';
locals.questionPreviewTabUrl = '/preview';
locals.questionSettingsTabUrl = '/settings';
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
    'demoFixedCheckbox',
    'demoMatrixAlgebra',
    'demoMatrixComplexAlgebra',
    'demoRandomCheckbox',
    'demoRandomDataFrame',
    'demoRandomMultipleChoice',
    'demoRandomPlot',
    'demoRandomSymbolic',
    'demoStudentFaces',
    'demoStudentNames',
    'elementCheckbox',
    'elementCode',
    // FIXME: 'demoDrawingCentroid',
    // FIXME: 'demoDrawingCollarRod',
    // FIXME: 'elementDrawingGallery',
    // FIXME: 'demoDrawingGradeVector',
    // FIXME: 'demoDrawingGraphs',
    // FIXME: 'demoDrawingInclinedPlane',
    // FIXME: 'demoDrawingLiftingMechanism',
    // FIXME: 'demoDrawingPulley',
    // FIXME: 'demoDrawingSimpleTutorial',
    // FIXME: 'demoDrawingVMDiagrams',
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
