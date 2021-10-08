const _ = require('lodash');
const cp = require('child_process');

const chunks = require('../lib/chunks');
const config = require('../lib/config');

module.exports = {
  prepareChunksIfNeeded: async function (question, course) {
    const questionIds = await chunks.getTemplateQuestionIdsAsync(question);

    const templateQuestionChunks = questionIds.map((id) => ({
      type: 'question',
      questionId: id,
    }));
    const chunksToLoad = [
      {
        type: 'question',
        questionId: question.id,
      },
      {
        type: 'clientFilesCourse',
      },
      {
        type: 'serverFilesCourse',
      },
      ...templateQuestionChunks,
    ];

    await chunks.ensureChunksForCourseAsync(course.id, chunksToLoad);
  },

  /**
   * 
   * @param {'generate' | 'getFile' | 'grade'} func 
   * @param {string} coursePath 
   * @param {any} question 
   * @param {Record<string, any>} inputData 
   */
  executeInSubprocess: async function (func, coursePath, question, inputData) {
    console.log('execute in subprocess called...');
    const data = {
      func,
      coursePath,
      question,
      ...inputData,
    };

    const workerPath = require.resolve('./calculation-worker');
    const child = cp.spawn('node', [workerPath], {
      // Unline with Python questions, calculation questions are executed
      // in the context of the PrairieLearn root directory. This is
      // necessary for the `config.questionDefaultsDir` value to work
      // correctly in the subprocess.
      cwd: process.cwd(),
      stdio: ['pipe', 'pipe', 'pipe', 'pipe'], // stdin, stdout, stderr, and an extra one for data
      timeout: config.questionTimeoutMilliseconds,
    });

    child.stdout.setEncoding('utf-8');
    child.stderr.setEncoding('utf-8');
    child.stdio[3].setEncoding('utf-8');

    // For debugging only.
    // TODO: remove before merging this.
    child.stdout.pipe(process.stdout);
    child.stderr.pipe(process.stderr);

    child.stdin.write(JSON.stringify(data));
    child.stdin.write('\n');

    // Capture response data, but don't do anything with it until the
    // process exits.
    let outputData = '';
    child.stdio[3].on('data', (data) => {
      outputData += data;
    });

    // Wait for the process to either exit or error.
    await new Promise((resolve, reject) => {
      let didFinish = false;

      child.on('exit', (code) => {
        if (didFinish) return;
        didFinish = true;
        if (code === 0) {
          resolve();
        } else {
          reject(new Error(`Subprocess exited with code ${code}`));
        }
      });

      child.on('error', (err) => {
        if (didFinish) return;
        didFinish = true;
        reject(err);
      });
    });

    // Hopefully we have valid JSON by this point!
    const parsedData = JSON.parse(outputData);
    const { val } = parsedData;
    if (!val) {
      throw new Error('Calculation question data missing "val" property');
    }
    console.log('got data!');

    return val;
  },

  render: function (
    renderSelection,
    variant,
    question,
    submission,
    submissions,
    course,
    course_instance,
    locals,
    callback,
  ) {
    // v2 questions don't render on the server - nothing to do here.
    const htmls = {
      extraHeadersHtml: '',
      questionHtml: '',
      submissionHtmls: _.map(submissions, () => ''),
      answerHtml: '',
    };
    callback(null, [], htmls);
  },

  generate: function (question, course, variant_seed, callback) {
    const coursePath = chunks.getRuntimeDirectoryForCourse(course);
    module.exports.prepareChunksIfNeeded(question, course).then(() => {
      module.exports.executeInSubprocess('generate', coursePath, question, {
        variant_seed,
      }).then((data) => callback(null, [], data)).catch((err) => callback(err));
    }).catch((err) => callback(err));
  },

  prepare: function (question, course, variant, callback) {
    // v2 questions don't have a prepare step that's controlled by user code.
    const data = {
      params: variant.params,
      true_answer: variant.true_answer,
      options: variant.options,
    };
    callback(null, [], data);
  },

  getFile: function (filename, variant, question, course, callback) {
    const coursePath = chunks.getRuntimeDirectoryForCourse(course);
    module.exports.prepareChunksIfNeeded(question, course).then(() => {
      module.exports.executeInSubprocess('getFile', coursePath, question, {
        filename,
        variant,
      }).then((data) => {
        // We need to "unwrap" buffers if needed
        const isBuffer = data.type === 'buffer';
        const unwrappedData = isBuffer ? Buffer.from(data.data, 'base64') : data.data;
        callback(null, [], unwrappedData);
      }).catch((err) => callback(err));
    }).catch((err) => callback(err));
  },

  parse: function (submission, variant, question, course, callback) {
    // v2 questions don't have a parse function that's controlled by user code.
    const data = {
      params: variant.params,
      true_answer: variant.true_answer,
      submitted_answer: submission.submitted_answer,
      raw_submitted_answer: submission.raw_submitted_answer,
      format_errors: {},
      gradable: true,
    };
    callback(null, [], data);
  },

  grade: function (submission, variant, question, course, callback) {
    const coursePath = chunks.getRuntimeDirectoryForCourse(course);
    module.exports.prepareChunksIfNeeded(question, course).then(() => {
      module.exports.executeInSubprocess('grade', coursePath, question, {
        submission,
        variant,
      }).then((data) => callback(null, [], data)).catch((err) => callback(err));
    }).catch((err) => callback(err));
  },
};
