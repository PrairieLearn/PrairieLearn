import {
  type Assessment,
  type AssessmentQuestion,
  type Course,
  type CourseInstance,
  type Question,
} from '../../../lib/db-types.js';
import { selectAssessmentQuestionByQuestionId } from '../../../models/assessment-question.js';
import { selectAssessmentByTid } from '../../../models/assessment.js';
import { selectCourseInstanceByShortName } from '../../../models/course-instances.js';
import { selectQuestionByQid } from '../../../models/question.js';

export interface ResolvedTarget {
  course_instance: CourseInstance;
  assessment: Assessment;
  question: Question;
  assessment_question: AssessmentQuestion;
}

/**
 * Resolves the synthetic course's AQ for a given eval id. The scaffolder
 * writes the eval id as the question QID, the assessment TID, and uses a
 * fixed course instance short name, so all four lookups should succeed once
 * the sync has run.
 */
export async function resolveAssessmentQuestion({
  course,
  courseInstanceShortName,
  evalId,
}: {
  course: Course;
  courseInstanceShortName: string;
  evalId: string;
}): Promise<ResolvedTarget> {
  const course_instance = await selectCourseInstanceByShortName({
    course,
    shortName: courseInstanceShortName,
  });
  const assessment = await selectAssessmentByTid({
    course_instance_id: course_instance.id,
    tid: evalId,
  });
  const question = await selectQuestionByQid({ qid: evalId, course_id: course.id });
  const assessment_question = await selectAssessmentQuestionByQuestionId({
    assessment_id: assessment.id,
    question_id: question.id,
  });
  return { course_instance, assessment, question, assessment_question };
}
