import { QuestionJsonSchema } from '../../apps/prairielearn/src/schemas/index.js';

import { validateWithSchema } from './utils.mjs';

// Pull all question `info.json` files off disk with the following:
//
// find /data1/courses -path "*/questions/**/info.json" -print0 | tee | tar --null -czvf /home/ec2-user/questions.tar.gz --files-from=-
//
// Get the onto your machine:
//
// yarn alma scp us-prod us.prairielearn.com remote:/home/ec2-user/questions.tar.gz us-prod-questions.tar.gz
//
// Then run this script:
//
// yarn dlx tsx scripts/validate-json-with-schemas/questions.mts ../path/to/us-prod-questions.tar.gz

const tarGzPath = process.argv[2];
if (!tarGzPath) {
  console.error('Usage: node validate-assessments.mts <path-to-tar.gz>');
  process.exit(1);
}

await (async () => {
  await validateWithSchema(tarGzPath, QuestionJsonSchema, 'infoQuestion.json');
})();
