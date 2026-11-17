import { type Response } from 'express';

import { HttpStatusError } from '@prairielearn/error';

import { PageLayout } from '../components/PageLayout.js';
import { type Course } from '../lib/db-types.js';
import { features } from '../lib/features/index.js';
import { typedAsyncHandler } from '../lib/res-locals.js';
import { selectOptionalCourseInstanceById } from '../models/course-instances.js';
import { selectOptionalCourseById } from '../models/course.js';

function MissingCourseSharingNameCard({ courseId }: { courseId: string }) {
  return (
    <div className="card mb-4">
      <div className="card-header bg-primary text-white">Missing sharing name</div>
      <div className="card-body">
        <p className="mb-0">
          This course doesn't have a sharing name. If you are an Owner of this course, please choose
          a sharing name on the{' '}
          <a href={`/pl/course/${courseId}/course_admin/sharing`}>course sharing settings page</a>.
        </p>
      </div>
    </div>
  );
}

/**
 * Enforces the course-level preconditions shared by every public route: question
 * sharing must be enabled for the course and the course must have a sharing name.
 *
 * Throws a 404 if question sharing is disabled. If the course is missing a
 * sharing name, renders the "Missing sharing name" page and returns `true` so the
 * caller knows the response has already been sent. Returns `false` otherwise.
 *
 * `res.locals.course` (and `res.locals.course_instance`, if applicable) must be
 * set before calling this, since the rendered page reads them.
 */
async function enforcePublicCourseSharing(res: Response, course: Course): Promise<boolean> {
  const questionSharingEnabled = await features.enabled('question-sharing', {
    institution_id: course.institution_id,
    course_id: course.id,
  });

  if (!questionSharingEnabled) {
    throw new HttpStatusError(404, 'Not Found');
  }

  // We specifically allow content from the example course to be shared without
  // a sharing name being set.
  if (!course.sharing_name && !course.example_course) {
    res.send(
      PageLayout({
        resLocals: res.locals,
        pageTitle: 'Missing sharing name',
        navContext: {
          type: 'public',
          page: 'error',
        },
        content: <MissingCourseSharingNameCard courseId={course.id} />,
      }),
    );
    return true;
  }

  return false;
}

/**
 * Resolves a public course route. Checks that the course exists, that question
 * sharing is enabled, and that the course has a sharing name, then sets
 * `res.locals.course`.
 *
 * This does **not** authorize access to any specific shared resource; pages are
 * responsible for checking the relevant `share_*` flags themselves.
 *
 * If resolution fails, responds with a 404 Not Found error.
 */
export const resolvePublicCourse = typedAsyncHandler<'public-course'>(async (req, res, next) => {
  const course = await selectOptionalCourseById(req.params.course_id);
  if (!course || course.deleted_at != null) throw new HttpStatusError(404, 'Not Found');

  res.locals.course = course;

  if (await enforcePublicCourseSharing(res, course)) return;

  next();
});

/**
 * Resolves a public course instance route. Checks that the course instance (and
 * its course) exist, that question sharing is enabled, and that the course has a
 * sharing name, then sets `res.locals.course` and `res.locals.course_instance`.
 *
 * This does **not** authorize access to any specific shared resource. In
 * particular, it does **not** check whether the course instance itself is shared
 * publicly, since individual assessments can be shared publicly without sharing
 * the entire course instance. Pages are responsible for checking the relevant
 * `share_*` flags themselves: e.g. pages that expose course-instance-level
 * content (like the list of all assessments) must check
 * `course_instance.share_source_publicly`, while an individual shared assessment
 * page checks the assessment's own `share_source_publicly`.
 *
 * If resolution fails, responds with a 404 Not Found error.
 */
export const resolvePublicCourseInstance = typedAsyncHandler<'public-course-instance'>(
  async (req, res, next) => {
    const course_instance = await selectOptionalCourseInstanceById(req.params.course_instance_id);
    if (!course_instance || course_instance.deleted_at != null) {
      throw new HttpStatusError(404, 'Not Found');
    }

    const course = await selectOptionalCourseById(course_instance.course_id);
    if (!course || course.deleted_at != null) throw new HttpStatusError(404, 'Not Found');

    res.locals.course = course;
    res.locals.course_instance = course_instance;

    if (await enforcePublicCourseSharing(res, course)) return;

    next();
  },
);
