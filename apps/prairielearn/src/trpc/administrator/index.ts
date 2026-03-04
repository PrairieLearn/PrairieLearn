import { administratorCourseRequestsRouter } from './course-requests.js';
import { administratorCoursesRouter } from './courses.js';
import { t } from './trpc.js';

export const administratorRouter = t.router({
  courseRequests: administratorCourseRequestsRouter,
  courses: administratorCoursesRouter,
});

export type AdministratorRouter = typeof administratorRouter;
