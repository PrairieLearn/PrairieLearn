import { mapSeries } from 'async';

import { config } from '../lib/config.js';
import {
  TEST_TYPES,
  type TestType,
  generateAndSaveTestSubmission,
} from '../lib/question-testing.js';
import { selectOptionalAssessmentById } from '../models/assessment.js';
import { selectOptionalCourseInstanceById } from '../models/course-instances.js';
import { selectCourseById } from '../models/course.js';
import {
  type InstanceQuestionForGeneration,
  selectOpenInstanceQuestionsForAssessment,
} from '../models/instance-question.js';

import { type AdministratorQueryResult, type AdministratorQuerySpecs } from './lib/util.js';

export const specs: AdministratorQuerySpecs = {
  description:
    'Creates a random submission for each assessment instance in an assessment. Assessment instances must already exist and be open. Submission is saved, but not graded.',
  enabled: config.devMode, // This query is dangerous in production environments, so it is only enabled in dev mode
  params: [
    {
      name: 'assessment_id',
      description: 'assessment_id to generate submissions for (integer)',
    },
    {
      name: 'test_type',
      description: `Type of submission to generate (${TEST_TYPES.map((type) => `"${type}"`).join(', ')} or "random")`,
      default: 'random',
    },
  ],
};

const columns = [
  'course_instance_id',
  'course_instance',
  'assessment_id',
  'assessment',
  'assessment_instance_id',
  'uid',
  'qid',
  'test_type',
  'submission_id',
] as const;
type ResultRow = Record<(typeof columns)[number], string | number | null>;

export default async function ({
  assessment_id,
  test_type,
}: {
  assessment_id: string;
  test_type: TestType | 'random';
}): Promise<AdministratorQueryResult> {
  const assessment = await selectOptionalAssessmentById(assessment_id);
  if (!assessment) return { rows: [], columns };
  const courseInstance = await selectOptionalCourseInstanceById(assessment.course_instance_id);
  if (!courseInstance) return { rows: [], columns };
  const assessmentCourse = await selectCourseById(courseInstance.course_id);

  const instanceQuestions = await selectOpenInstanceQuestionsForAssessment(assessment_id);

  const rows = await mapSeries(
    instanceQuestions,
    async ({
      question,
      instance_question,
      user,
      question_course,
    }: InstanceQuestionForGeneration): Promise<ResultRow> => {
      const currentTestType =
        test_type === 'random'
          ? TEST_TYPES[Math.floor(Math.random() * TEST_TYPES.length)]
          : test_type;
      const { submission_id } = await generateAndSaveTestSubmission({
        question,
        questionCourse: question_course,
        courseInstance,
        variantCourse: assessmentCourse,
        instanceQuestionId: instance_question.id,
        userId: user.id,
        testType: currentTestType,
        grade: false,
      });

      return {
        course_instance_id: assessment.course_instance_id,
        course_instance: courseInstance.short_name,
        assessment_id: assessment.id,
        assessment: assessment.tid ?? assessment.id,
        assessment_instance_id: instance_question.assessment_instance_id,
        uid: user.uid,
        qid: question.qid ?? question.id,
        test_type: currentTestType,
        submission_id,
      };
    },
  );

  return { rows, columns };
}
