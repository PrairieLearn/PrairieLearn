import { makeCourseSyncBackfillMigration } from './lib/course-sync-backfill.js';

export default makeCourseSyncBackfillMigration({ boundsTableName: 'pl_courses' });
