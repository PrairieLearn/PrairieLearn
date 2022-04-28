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
    throw new Error('Aborting deploy');
  }
}

(async () => {
  await config.loadConfigAsync('config.json');

  const assessmentQuestionId = process.argv[2];
  if (!assessmentQuestionId) {
    throw new Error('Missing assessment question ID');
  }

  await confirm(`Proceed with assessment question ${assessmentQuestionId}?`);
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
