// @ts-check
const _ = require('lodash');
const path = require('node:path');
const { contains } = require('@prairielearn/path-utils');

const { config } = require('../lib/config');
const chunks = require('../lib/chunks');
const filePaths = require('../lib/file-paths');
const { REPOSITORY_ROOT_PATH } = require('../lib/paths');
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

function getQuestionRuntimePath(questionServerPath, courseHostPath, courseRuntimePath) {
  const questionServerType = contains(courseHostPath, questionServerPath) ? 'course' : 'core';

  if (questionServerType === 'course') {
    const questionServerPathWithinCourse = path.relative(courseHostPath, questionServerPath);
    return path.join(courseRuntimePath, questionServerPathWithinCourse);
  }

  if (config.workersExecutionMode === 'native') {
    return questionServerPath;
  } else {
    const questionServerPathWithinRepo = path.relative(REPOSITORY_ROOT_PATH, questionServerPath);

    // This is hardcoded to use the `/PrairieLearn` directory in our container
    // image, which is where the repository files will be located.
    return path.join('/PrairieLearn', questionServerPathWithinRepo);
  }
}

async function callFunction(func, question_course, question, inputData) {
  await prepareChunksIfNeeded(question, question_course);

  const courseHostPath = chunks.getRuntimeDirectoryForCourse(question_course);
  const courseRuntimePath = config.workersExecutionMode === 'native' ? courseHostPath : '/course';

  const { fullPath: questionServerPath } = await filePaths.questionFilePathAsync(
    'server.js',
    question.directory,
    courseHostPath,
    question,
  );

  // `questionServerPath` may be one of two things:
  //
  // - A path to a file within the course directory
  // - A path to a file in PrairieLearn's `v2-question-servers` directory
  //
  // We need to handle these differently.
  const questionServerRuntimePath = getQuestionRuntimePath(
    questionServerPath,
    courseHostPath,
    courseRuntimePath,
  );

  try {
    return await withCodeCaller(courseHostPath, async (codeCaller) => {
      const res = await codeCaller.call('v2-question', null, questionServerRuntimePath, null, [
        {
          questionServerPath: questionServerRuntimePath,
          func: func,
          coursePath: courseRuntimePath,
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
    (err) => callback(err),
  );
};

module.exports.grade = (submission, variant, question, question_course, callback) => {
  callFunction('grade', question_course, question, { submission, variant }).then(
    ({ data, courseIssues }) => callback(null, courseIssues, data),
    (err) => callback(err),
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
    (err) => callback(err),
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
  callback,
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
