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
    // FIXME: 'demo/ansiOutput',
    'demo/calculation',
    // FIXME: 'demo/codeEditorAutograded',
    // FIXME: 'demo/codeUploadAutograded',
    // FIXME: 'demo/codeUploadManualGrade',
    'demo/customElement',
    'demo/customGradeFunction',
    'demo/fixedCheckbox',
    'demo/matrixAlgebra',
    'demo/matrixComplexAlgebra',
    'demo/randomCheckbox',
    'demo/randomDataFrame',
    'demo/randomMultipleChoice',
    'demo/randomPlot',
    'demo/randomSymbolic',
    'demo/studentFaces',
    'demo/studentNames',
    'element/checkbox',
    'element/code',
    // FIXME: 'demo/drawingCentroid',
    // FIXME: 'demo/drawingCollarRod',
    // FIXME: 'element/drawingGallery',
    // FIXME: 'demo/drawingGradeVector',
    // FIXME: 'demo/drawingGraphs',
    // FIXME: 'demo/drawingInclinedPlane',
    // FIXME: 'demo/drawingLiftingMechanism',
    // FIXME: 'demo/drawingPulley',
    // FIXME: 'demo/drawingSimpleTutorial',
    // FIXME: 'demo/drawingVMDiagrams',
    // FIXME: 'element/codeDocumentation',
    'element/fileDownload',
    // FIXME: 'element/fileEditor',
    'element/graph',
    'element/integerInput',
    'element/markdown',
    'element/matrixComponentInput',
    'element/matrixLatex',
    'element/multipleChoice',
    'element/numberInput',
    'element/panels',
    'element/prairieDrawFigure',
    'element/pythonVariable',
    'element/stringInput',
    // FIXME: 'element/symbolicInput',
    // FIXME: 'element/threeJS',
    'element/variableOutput',
];

describe('Auto-test questions in exampleCourse', function() {
    this.timeout(60000);

    before('set up testing server', helperServer.before(exampleCourseDir));
    after('shut down testing server', helperServer.after);

    qidsExampleCourse.forEach(qid => helperQuestion.autoTestQuestion(locals, qid));
});
