// @ts-check
const _ = require('lodash');

const chunks = require('../lib/chunks');
const filePaths = require('../lib/file-paths');
const { withCodeCaller } = require('../lib/code-caller');

/** @typedef {import('../lib/chunks').Chunk} Chunk */

async function prepareChunksIfNeeded(question, course) {
  const questionIds = await chunks.getTemplateQuestionIdsAsync(question);

  /** @type {Chunk[]} */
  const templateQuestionChunks = questionIds.map((id) => ({
    type: 'question',
    questionId: id,
  }));

  /** @type {Chunk[]} */
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
}

async function callFunction(func, course, question, inputData) {
  await prepareChunksIfNeeded(question, course);
  const coursePath = chunks.getRuntimeDirectoryForCourse(course);
  const { fullPath: questionServerPath } = await filePaths.questionFilePathAsync(
    'server.js',
    question.directory,
    coursePath,
    question
  );
  try {
    return withCodeCaller(coursePath, async (codeCaller) => {
      const res = await codeCaller.call('v2-question', null, questionServerPath, null, [
        {
          questionServerPath,
          func: func,
          coursePath,
          question,
          ...inputData,
        },
      ]);
      // Note that `res` also contains an `output` property. For v3 questions,
      // we'd create a course issue if `output` is non-empty. However, we didn't
      // historically have a restriction where v2 questions couldn't write logs,
      // so we won't impose the same restriction here.
      return { data: res.result, courseIssues: [] };
    });
  } catch (err) {
    err.fatal = true;
    return { data: {}, courseIssues: [err] };
  }
}

module.exports.generate = (question, course, variant_seed, callback) => {
  callFunction('generate', course, question, { variant_seed }).then(
    ({ data, courseIssues }) => callback(null, courseIssues, data),
    (err) => callback(err)
  );
};

module.exports.grade = (submission, variant, question, course, callback) => {
  callFunction('grade', course, question, { submission, variant }).then(
    ({ data, courseIssues }) => callback(null, courseIssues, data),
    (err) => console.log(err)
  );
};

module.exports.getFile = (filename, variant, question, course, callback) => {
  callFunction('getFile', course, question, { filename, variant }).then(
    ({ data, courseIssues }) => {
      // We need to "unwrap" buffers if needed
      const isBuffer = data.type === 'buffer';
      const unwrappedData = isBuffer ? Buffer.from(data.data, 'base64') : data.data;
      callback(null, courseIssues, unwrappedData);
    },
    (err) => callback(err)
  );
};

// The following functions don't do anything for v2 questions; they're just
// here to satisfy the question server interface.

module.exports.render = function (
  renderSelection,
  variant,
  question,
  submission,
  submissions,
  course,
  course_instance,
  locals,
  callback
) {
  const htmls = {
    extraHeadersHtml: '',
    questionHtml: '',
    submissionHtmls: _.map(submissions, () => ''),
    answerHtml: '',
  };
  callback(null, [], htmls);
};

module.exports.prepare = function (question, course, variant, callback) {
  const data = {
    params: variant.params,
    true_answer: variant.true_answer,
    options: variant.options,
  };
  callback(null, [], data);
};

module.exports.parse = function (submission, variant, question, course, callback) {
  const data = {
    params: variant.params,
    true_answer: variant.true_answer,
    submitted_answer: submission.submitted_answer,
    raw_submitted_answer: submission.raw_submitted_answer,
    format_errors: {},
    gradable: true,
  };
  callback(null, [], data);
};
