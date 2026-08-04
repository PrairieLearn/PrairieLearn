import { syncSharedStateObjectsForCourse } from '../../models/shared-state-object.js';
import { type CourseData } from '../course-db.js';
import * as infofile from '../infofile.js';

export async function sync(courseId: string, courseData: CourseData) {
  if (infofile.hasErrors(courseData.course)) return;

  const definitions = courseData.course.data?.sharedState;
  if (definitions == null || Object.keys(definitions).length === 0) return;

  const namesByUuid = new Map<string, string>();
  for (const [name, definition] of Object.entries(definitions)) {
    const existingName = namesByUuid.get(definition.uuid);
    if (existingName != null) {
      infofile.addError(
        courseData.course,
        `Shared-state objects "${existingName}" and "${name}" use the same UUID "${definition.uuid}".`,
      );
    } else {
      namesByUuid.set(definition.uuid, name);
    }
  }
  if (infofile.hasErrors(courseData.course)) return;

  const { errorsByName } = await syncSharedStateObjectsForCourse(courseId, definitions);
  for (const [name, errors] of Object.entries(errorsByName)) {
    for (const error of errors) {
      infofile.addError(courseData.course, `Shared-state object "${name}": ${error}`);
    }
  }
}
