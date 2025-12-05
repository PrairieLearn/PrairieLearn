import { Router } from 'express';
import asyncHandler from 'express-async-handler';
import z from 'zod';

import * as error from '@prairielearn/error';

import { PageLayout } from '../../components/PageLayout.js';
import { PublicCourseInstanceSchema, PublicCourseSchema } from '../../lib/client/safe-db-types.js';
import { getCourseInstanceCopyTargets } from '../../lib/copy-content.js';
import { UserSchema } from '../../lib/db-types.js';
import { features } from '../../lib/features/index.js';
import { selectAssessments } from '../../models/assessment.js';
import { selectOptionalCourseInstanceById } from '../../models/course-instances.js';
import { selectCourseById } from '../../models/course.js';
import { selectQuestionsForCourseInstanceCopy } from '../../models/question.js';

import {
  SafeCopyTargetSchema,
  SafeQuestionForCopySchema,
} from './components/CopyCourseInstanceModal.js';
import { PublicAssessments, SafeAssessmentRowSchema } from './publicAssessments.html.js';

const router = Router({ mergeParams: true });

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const courseInstance = await selectOptionalCourseInstanceById(req.params.course_instance_id);
    if (courseInstance === null) {
      throw new error.HttpStatusError(404, 'Not Found');
    }
    if (!courseInstance.share_source_publicly) {
      throw new error.HttpStatusError(404, 'Course instance not public.');
    }

    res.locals.course_instance = courseInstance;
    const course = await selectCourseById(courseInstance.course_id);
    res.locals.course = course;

    const courseInstanceCopyTargets = await getCourseInstanceCopyTargets({
      course,
      is_administrator: res.locals.is_administrator,
      user: UserSchema.parse(res.locals.authn_user),
      authn_user: res.locals.authn_user,
      courseInstance,
    });

    const rows = await selectAssessments({
      course_instance_id: courseInstance.id,
    });
    const questionsForCopy = await selectQuestionsForCourseInstanceCopy(courseInstance.id);

    const safeCourse = PublicCourseSchema.parse(course);
    const safeCourseInstance = PublicCourseInstanceSchema.parse(courseInstance);
    const safeQuestionsForCopy = z.array(SafeQuestionForCopySchema).parse(questionsForCopy);
    const safeCourseInstanceCopyTargets = z
      .array(SafeCopyTargetSchema)
      .parse(courseInstanceCopyTargets);
    const safeRows = z.array(SafeAssessmentRowSchema).parse(rows);

    // Check the feature flag globally since we don't know the destination course yet
    const enrollmentManagementEnabled = await features.enabled('enrollment-management', {});

    res.send(
      PageLayout({
        resLocals: res.locals,
        pageTitle: 'Assessments',
        navContext: {
          type: 'public',
          page: 'assessments',
        },
        options: {
          fullWidth: false,
        },
        content: (
          <PublicAssessments
            rows={safeRows}
            courseInstance={safeCourseInstance}
            course={safeCourse}
            courseInstanceCopyTargets={safeCourseInstanceCopyTargets}
            questionsForCopy={safeQuestionsForCopy}
            enrollmentManagementEnabled={enrollmentManagementEnabled}
          />
        ),
      }),
    );
  }),
);

export default router;
