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
  // FIXME: 'demo/autograder/ansiOutput',
  'demo/calculation',
  // FIXME: 'demo/autograder/codeEditor',
  // FIXME: 'demo/autograder/codeUpload',
  // FIXME: 'demo/manualGrade/codeUpload',
  'demo/custom/element',
  'demo/custom/gradeFunction',
  'demo/fixedCheckbox',
  'demo/matrixAlgebra',
  'demo/matrixComplexAlgebra',
  'demo/randomCheckbox',
  'demo/randomDataFrame',
  'demo/randomMultipleChoice',
  'demo/randomPlot',
  'demo/randomSymbolic',
  'demo/proofBlocks',
  'element/checkbox',
  'element/code',
  // FIXME: 'demo/drawing/centroid',
  // FIXME: 'demo/drawing/collarRod',
  // FIXME: 'element/drawingGallery',
  // FIXME: 'demo/drawing/gradeVector',
  // FIXME: 'demo/drawing/graphs',
  // FIXME: 'demo/drawing/inclinedPlane',
  // FIXME: 'demo/drawing/liftingMechanism',
  // FIXME: 'demo/drawing/pulley',
  // FIXME: 'demo/drawing/simpleTutorial',
  // FIXME: 'demo/drawing/vmDiagrams',
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
  'element/pythonVariable',
  'element/stringInput',
  // FIXME: 'element/symbolicInput',
  // FIXME: 'element/threeJS',
  'element/variableOutput',
  'element/orderBlocks',
];

describe('Auto-test questions in exampleCourse', function () {
  this.timeout(60000);

  before('set up testing server', helperServer.before(exampleCourseDir));
  after('shut down testing server', helperServer.after);

  qidsExampleCourse.forEach((qid) => helperQuestion.autoTestQuestion(locals, qid));
});
