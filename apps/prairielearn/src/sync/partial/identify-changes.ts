import path from 'node:path';

interface PartialSyncPlan {
  syncCourse: boolean;
  syncQuestions: boolean;
  /** Whether all course instances should be synced. */
  syncCourseInstances: boolean;
  /** Set of course instance names for which assessments should be synced. */
  syncCourseInstanceAssessments: Set<string>;
}

export function extractCourseInstanceFromPath(courseInstances: Set<string>, filePath: string) {
  if (!filePath.startsWith('courseInstances/')) {
    return null;
  }

  const pathComponents = filePath.split(path.sep).slice(1);

  let courseInstanceName = '';
  for (const component of pathComponents) {
    courseInstanceName = path.join(courseInstanceName, component);
    if (courseInstances.has(courseInstanceName)) {
      return courseInstanceName;
    }
  }

  return null;
}

export function identifyChanges(changedFiles: string[], courseInstanceNames: Set<string>) {
  // We only care about JSON files in the syncing process.
  const changedJsonFiles = changedFiles.filter((changedFile) => changedFile.endsWith('.json'));

  const plan: PartialSyncPlan = {
    syncCourse: false,
    syncQuestions: false,
    syncCourseInstances: false,
    syncCourseInstanceAssessments: new Set(),
  };

  for (const changedFile of changedJsonFiles) {
    if (changedFile === 'infoCourse.json') {
      plan.syncCourse = true;
      continue;
    }

    if (changedFile.startsWith('questions/')) {
      plan.syncQuestions = true;
      continue;
    }

    if (changedFile.startsWith('courseInstances/')) {
      const courseInstanceName = extractCourseInstanceFromPath(courseInstanceNames, changedFile);

      if (changedFile.endsWith('infoCourseInstance.json')) {
        plan.syncCourseInstances = true;

        // If the course instance has changed, we will also resync all assessments
        // so that we can pick up any changes to the course instance timezone.
        if (courseInstanceName) {
          plan.syncCourseInstanceAssessments.add(courseInstanceName);
        }

        continue;
      }

      if (changedFile.endsWith('infoAssessment.json')) {
        if (courseInstanceName) {
          plan.syncCourseInstanceAssessments.add(courseInstanceName);
        }
      }
    }
  }

  return plan;
}
