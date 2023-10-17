const { config } = require('../lib/config');
const { EXAMPLE_COURSE_PATH } = require('../lib/paths');

var helperServer = require('./helperServer');
var helperQuestion = require('./helperQuestion');

const locals = {};

locals.siteUrl = 'http://localhost:' + config.serverPort;
locals.baseUrl = locals.siteUrl + '/pl';
locals.courseInstanceBaseUrl = locals.baseUrl + '/course_instance/1/instructor';
locals.questionBaseUrl = locals.courseInstanceBaseUrl + '/question';
locals.questionPreviewTabUrl = '/preview';
locals.questionsUrl = locals.courseInstanceBaseUrl + '/questions';
locals.isStudentPage = false;

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
  'demo/randomFakeData',
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
  'element/symbolicInput',
  'element/bigOInput',
  'element/unitsInput',
  // FIXME: 'element/threeJS',
  'element/variableOutput',
  'element/orderBlocks',
];

describe('Auto-test questions in exampleCourse', function () {
  this.timeout(60000);

  before('set up testing server', helperServer.before(EXAMPLE_COURSE_PATH));
  after('shut down testing server', helperServer.after);

  qidsExampleCourse.forEach((qid) => helperQuestion.autoTestQuestion(locals, qid));
});

describe('Auto-test questions in exampleCourse with process-questions-in-worker enabled', function () {
  this.timeout(60000);

  before('set up testing server', helperServer.before(EXAMPLE_COURSE_PATH));
  after('shut down testing server', helperServer.after);

  let originalProcessQuestionsInWorker = config.features['process-questions-in-worker'];
  before('enable process-questions-in-worker', () => {
    config.features['process-questions-in-worker'] = true;
  });
  after('restore process-questions-in-worker', () => {
    config.features['process-questions-in-worker'] = originalProcessQuestionsInWorker;
  });

  // Only test the first 10 questions so that this test doesn't take too long.
  qidsExampleCourse.slice(0, 10).forEach((qid) => helperQuestion.autoTestQuestion(locals, qid));
});
