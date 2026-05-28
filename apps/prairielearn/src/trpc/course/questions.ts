import { SafeQuestionsPageDataSchema } from '../../components/QuestionsTable.shared.js';
import { selectCourseInstancesWithStaffAccess } from '../../models/course-instances.js';
import { selectQuestionsForCourse } from '../../models/questions.js';

import { requireCoursePermissionPreview, t } from './init.js';

const list = t.procedure.use(requireCoursePermissionPreview).query(async ({ ctx }) => {
  const courseInstances = await selectCourseInstancesWithStaffAccess({
    course: ctx.course,
    authzData: ctx.authz_data,
    requiredRole: ['Previewer'],
  });

  const rawQuestions = await selectQuestionsForCourse(
    ctx.course.id,
    courseInstances.map((ci) => ci.id),
  );

  return rawQuestions.map((q) => SafeQuestionsPageDataSchema.parse(q));
});

export const questionsRouter = t.router({
  list,
});
