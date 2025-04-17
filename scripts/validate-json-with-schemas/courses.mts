import { CourseJsonSchema } from '../../apps/prairielearn/src/schemas/index.js';

import { validateWithSchema } from './utils.mjs';

// Pull all `infoCourse.json` files off disk with the following:
//
// find /data1/courses -path "*/infoCourse.json" -print0 | tee | tar --null -czvf /home/ec2-user/courses.tar.gz --files-from=-
//
// Get the onto your machine:
//
// yarn alma scp us-prod us.prairielearn.com remote:/home/ec2-user/courses.tar.gz us-prod-courses.tar.gz
//
// Then run this script:
//
// yarn dlx tsx scripts/validate-json-with-schemas/courses.mts ../path/to/us-prod-courses.tar.gz

const tarGzPath = process.argv[2];
if (!tarGzPath) {
  console.error('Missing tarball path');
  process.exit(1);
}

await (async () => {
  await validateWithSchema(tarGzPath, CourseJsonSchema, 'infoCourse.json');
})();
