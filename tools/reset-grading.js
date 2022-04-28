const prompts = require('prompts');

const config = require('../lib/config');
const question = require('../lib/question');
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

(async () => {
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

  const assessmentQuestionId = process.argv[2];
  if (!assessmentQuestionId) {
    throw new Error('Missing assessment question ID');
  }

  const assessmentQuestionInfo = (
    await sqldb.queryOneRowAsync(sql.select_assessment_question_info, {
      assessment_question_id: assessmentQuestionId,
    })
  ).rows[0];

  console.log(`Question QID: ${assessmentQuestionInfo.question_qid}`);
  console.log(`Assessment: ${assessmentQuestionInfo.assessment_title}`);

  await confirm(
    `Proceed with resetting all submissions for assessment question ${assessmentQuestionId}?`
  );

  await sqldb.queryAsync(sql.reset_grading, {
    assessment_question_id: assessmentQuestionId,
  });

  console.log('Success!');

  await sqldb.closeAsync();
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
