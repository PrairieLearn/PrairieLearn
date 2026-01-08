import { HttpStatusError } from '@prairielearn/error';
import { run } from '@prairielearn/run';

import { MissingSharingNameCard } from '../components/MissingSharingNameCard.js';
import { PageLayout } from '../components/PageLayout.js';
import { features } from '../lib/features/index.js';
import { typedAsyncHandler } from '../lib/res-locals.js';
import { selectOptionalCourseInstanceById } from '../models/course-instances.js';
import { selectOptionalCourseById } from '../models/course.js';

export default typedAsyncHandler<'public-course' | 'public-course-instance'>(
  async (req, res, next) => {
    const { course, course_instance } = await run(async () => {
      if (req.params.course_instance_id) {
        const course_instance = await selectOptionalCourseInstanceById(
          req.params.course_instance_id,
        );
        if (!course_instance) return { course: null, course_instance: null };

        return {
          course: await selectOptionalCourseById(course_instance.course_id),
          course_instance,
        };
      }

      if (req.params.course_id) {
        return {
          course: await selectOptionalCourseById(req.params.course_id),
          course_instance: null,
        };
      }

      throw new Error('Either course_id or course_instance_id must be provided.');
    });

    if (!course) throw new HttpStatusError(404, 'Not Found');

    const questionSharingEnabled = await features.enabled('question-sharing', {
      institution_id: course.institution_id,
      course_id: course.id,
    });

    if (!questionSharingEnabled) {
      throw new HttpStatusError(404, 'Not Found');
    }

    if (course_instance && !course_instance.share_source_publicly) {
      throw new HttpStatusError(404, 'Not Found');
    }

    res.locals.course = course;
    if (course_instance) res.locals.course_instance = course_instance;

    if (!course.sharing_name) {
      res.send(
        PageLayout({
          resLocals: res.locals,
          pageTitle: 'Missing sharing name',
          navContext: {
            type: 'public',
            page: 'error',
          },
          content: <MissingSharingNameCard courseId={course.id} />,
        }),
      );
      return;
    }

    next();
  },
);
