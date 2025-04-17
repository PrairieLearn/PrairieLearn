import { CourseInstanceJsonSchema } from '../../apps/prairielearn/src/schemas/index.js';

import { validateWithSchema } from './utils.mjs';

// Pull all `infoCourseInstance.json` files off disk with the following:
//
// find /data1/courses -path "*/courseInstances/**/infoCourseInstance.json" -print0 | tee | tar --null -czvf /home/ec2-user/course-instances.tar.gz --files-from=-
//
// Get the onto your machine:
//
// yarn alma scp us-prod us.prairielearn.com remote:/home/ec2-user/course-instances.tar.gz us-prod-course-instances.tar.gz
//
// Then run this script:
//
// yarn dlx tsx scripts/validate-json-with-schemas/courseInstances.mts ../path/to/us-prod-course-instances.tar.gz

const tarGzPath = process.argv[2];
if (!tarGzPath) {
  console.error('Missing tarball path');
  process.exit(1);
}

await (async () => {
  await validateWithSchema(tarGzPath, CourseInstanceJsonSchema, 'infoCourseInstance.json');
})();
