import { Router } from 'express';
import asyncHandler from 'express-async-handler';

import * as error from '@prairielearn/error';
import { Hydrate } from '@prairielearn/preact/server';

import { PageLayout } from '../../components/PageLayout.js';
import { StaffCourseInstanceSchema, StaffCourseSchema } from '../../lib/client/safe-db-types.js';
import { getCourseInstanceCopyTargets } from '../../lib/copy-content.js';
import { UserSchema } from '../../lib/db-types.js';
import { selectAssessments } from '../../models/assessment.js';
import { selectOptionalCourseInstanceById } from '../../models/course-instances.js';
import { selectCourseById } from '../../models/course.js';
import { selectQuestionsForCourseInstanceCopy } from '../../models/question.js';

import { CopyCourseInstanceModal } from './components/CopyCourseInstanceModal.js';
import { PublicAssessments } from './publicAssessments.html.js';

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

    // Parse to safe types for client-side use
    const safeCourse = StaffCourseSchema.parse(course);
    const safeCourseInstance = StaffCourseInstanceSchema.parse(courseInstance);

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
          <div class="card mb-4">
            <div class="card-header bg-primary text-white d-flex align-items-center">
              <h1>Assessments</h1>
              <div class="ms-auto d-flex flex-row gap-1">
                <div class="btn-group">
                  <Hydrate>
                    <CopyCourseInstanceModal
                      course={safeCourse}
                      courseInstance={safeCourseInstance}
                      courseInstanceCopyTargets={courseInstanceCopyTargets}
                      questionsForCopy={questionsForCopy}
                    />
                  </Hydrate>
                </div>
              </div>
            </div>

            <PublicAssessments rows={rows} courseInstance={safeCourseInstance} />
          </div>
        ),
      }),
    );
  }),
);

export default router;
