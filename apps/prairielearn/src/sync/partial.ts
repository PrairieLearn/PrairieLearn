import { CourseData } from './course-db.js';

export interface PartialSyncPlan {
  course: { sync: boolean };
}

export async function planPartialSync(courseData: CourseData, changedFiles: string[]) {
  // Currently, only JSON files are used in the syncing process. Exclude any
  // changed files that aren't JSON files.
  changedFiles = changedFiles.filter((changedFile) => changedFile.endsWith('.json'));

  const plan: PartialSyncPlan = {
    course: { sync: false },
  };

  changedFiles.forEach((changedFile) => {
    if (changedFile === 'infoCourse.json') {
      plan.course.sync = true;
      return;
    }

    if (changedFile.startsWith('questions/')) {
      // Identify which question changed. Because questions can exist in nested
      // directories, we need to try progressively larger prefixes until we find
      // a match. This handles the unlikely case where both of the following files
      // exist:
      // - `questions/foo/info.json`
      // - `questions/foo/bar/info.json`
    }
  });
}
