const prompts = require('prompts');
const util = require('util');
const http = require('http');

const config = require('../lib/config');
const question = require('../lib/question');
const workers = require('../lib/workers');
const externalGrader = require('../lib/externalGrader');
const socketServer = require('../lib/socket-server');
const externalGradingSocket = require('../lib/externalGradingSocket');
const freeform = require('../question-servers/freeform');
const sprocs = require('../sprocs');
const sqldb = require('../prairielib/lib/sql-db');
const sqlLoader = require('../prairielib/lib/sql-loader');

const sql = sqlLoader.loadSqlEquiv(__filename);

async function confirm(message) {
  const { result } = await prompts({
    type: 'confirm',
    name: 'result',
    message,
  });

  if (!result) {
    throw new Error('Aborting');
  }
}

async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function resetAssessmentQuestionSubmissions(assessmentQuestionId, assessmentInstanceId) {
  await confirm(
    `Proceed with resetting all submissions for assessment question ${assessmentQuestionId}?`
  );

  await sqldb.queryAsync(sql.reset_grading, {
    assessment_question_id: assessmentQuestionId,
    assessment_instance_id: assessmentInstanceId,
  });

  console.log('Success!');
}

async function regradeAssessmentQuestionSubmissions(assessmentQuestionId, assessmentInstanceId) {
  await confirm(
    `Proceed with regrading all submissions for assessment question ${assessmentQuestionId}?`
  );

  let currentSubmissionId = null;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    // Select the next submission to either begin grading or check the status of.
    const nextSubmission = (
      await sqldb.queryZeroOrOneRowAsync(sql.select_next_submission_to_grade, {
        assessment_question_id: assessmentQuestionId,
        assessment_instance_id: assessmentInstanceId,
      })
    ).rows[0];

    if (!nextSubmission) {
      console.log('All submissions graded!');
      break;
    }

    // Only log this at most once per submission.
    if (nextSubmission.grading_requested_at != null && currentSubmissionId !== nextSubmission.id) {
      currentSubmissionId = nextSubmission.id;
      console.log(`Waiting for submission ${nextSubmission.id} to be graded...`);
    }

    if (nextSubmission.grading_requested_at == null) {
      console.log(`Submitting new grading job for submission ${nextSubmission.id}...`);
      console.log(nextSubmission);

      await new Promise((resolve) => {
        question.gradeVariant(
          nextSubmission.variant,
          nextSubmission.id,
          nextSubmission.question,
          nextSubmission.course,
          1, // TODO: authn_user_id - do we need this? YES WE DO.
          true, // overrideGradeRateCheck
          true, // allowOldSubmission
          (err) => {
            if (err) {
              console.error(`Error grading submission ${nextSubmission.id}`, err, nextSubmission);
            }

            // If we get an error, proceed anyways.
            resolve();
          }
        );
      });
    }

    await sleep(1000);
  }
}

(async () => {
  const action = process.argv[2];
  if (!['reset', 'regrade'].includes(action)) {
    throw new Error('Action must be either "reset" or "regrade"');
  }

  const assessmentQuestionId = process.argv[3];
  if (!assessmentQuestionId) {
    throw new Error('Missing assessment question ID');
  }

  const assessmentInstanceId = process.argv[4];

  await config.loadConfigAsync('config.json');

  const pgConfig = {
    user: config.postgresqlUser,
    database: config.postgresqlDatabase,
    host: config.postgresqlHost,
    password: config.postgresqlPassword,
    max: config.postgresqlPoolSize,
    idleTimeoutMillis: config.postgresqlIdleTimeoutMillis,
  };
  function idleErrorHandler(err) {
    console.error('idle client error', err);
    process.exit(1);
  }
  await sqldb.initAsync(pgConfig, idleErrorHandler);
  await sqldb.setRandomSearchSchemaAsync('regrade');
  await util.promisify(sprocs.init)();
  await util.promisify(freeform.init)();
  await util.promisify(externalGrader.init)();
  // Create a dummy http server that we can pass to `socket.io`.
  const server = http.createServer();
  await util.promisify(socketServer.init)(server);
  await util.promisify(externalGradingSocket.init)();
  workers.init();

  const assessmentQuestionInfo = (
    await sqldb.queryOneRowAsync(sql.select_assessment_question_info, {
      assessment_question_id: assessmentQuestionId,
      assessment_instance_id: assessmentInstanceId,
    })
  ).rows[0];

  console.log(`Question QID: ${assessmentQuestionInfo.question_qid}`);
  console.log(`Assessment: ${assessmentQuestionInfo.assessment_title}`);

  if (assessmentInstanceId) {
    const assessmentInstanceInfo = (
      await sqldb.queryOneRowAsync(sql.select_assessment_instance_info, {
        assessment_instance_id: assessmentInstanceId,
      })
    ).rows[0];
    console.log(
      `Assessment instance user: ${assessmentInstanceInfo.name} (${assessmentInstanceInfo.uid})`
    );
    console.log(`Assessment instance assessment: ${assessmentInstanceInfo.assessment_title}`);
  }

  switch (action) {
    case 'reset': {
      await resetAssessmentQuestionSubmissions(assessmentQuestionId, assessmentInstanceId);
      break;
    }

    case 'regrade': {
      await regradeAssessmentQuestionSubmissions(assessmentQuestionId, assessmentInstanceId);
      break;
    }
  }

  await sqldb.closeAsync();
  await util.promisify(workers.finish)();
  await util.promisify(socketServer.close)();
  server.close();
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
