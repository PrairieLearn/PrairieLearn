import { Router } from 'express';
import { Table } from 'react-bootstrap';

import { Hydrate } from '@prairielearn/react/server';
import { generatePrefixCsrfToken } from '@prairielearn/signed-token';

import { PageLayout } from '../../components/PageLayout.js';
import { extractPageContext } from '../../lib/client/page-context.js';
import { getCourseTrpcUrl } from '../../lib/client/url.js';
import { config } from '../../lib/config.js';
import { typedAsyncHandler } from '../../lib/res-locals.js';
import { getUrl } from '../../lib/url.js';
import { createAuthzMiddleware } from '../../middlewares/authzHelper.js';
import { selectCourseInstancesWithStaffAccess } from '../../models/course-instances.js';
import { selectCourseUsers } from '../../models/course-permissions.js';

import { StaffTable } from './StaffTable.js';

const router = Router();

const MAX_UIDS = 100;

router.get(
  '/',
  createAuthzMiddleware({
    oneOfPermissions: ['has_course_permission_preview', 'has_course_instance_permission_view'],
    unauthorizedUsers: 'block',
  }),
  typedAsyncHandler<'course'>(async (req, res) => {
    const { authz_data: authzData, course } = extractPageContext(res.locals, {
      pageType: 'course',
      accessType: 'instructor',
    });

    const courseUsers = await selectCourseUsers({ course_id: course.id });

    if (!authzData.has_course_permission_own) {
      const owners = courseUsers.filter(
        ({ course_permission }) => course_permission.course_role === 'Owner',
      );
      res.send(
        PageLayout({
          resLocals: res.locals,
          pageTitle: 'Staff',
          navContext: { type: 'instructor', page: 'course_admin', subPage: 'staff' },
          content: (
            <div className="card mb-4">
              <div className="card-header bg-primary text-white">
                <h1>Course owners</h1>
              </div>
              <div className="card-body">
                <p>
                  Contact a course Owner to request access to the course's GitHub repository. Only
                  Owners can manage course staff.
                </p>
                {owners.length === 0 ? (
                  <p className="mb-0">
                    No course Owners are listed. Please contact support for help.
                  </p>
                ) : (
                  <Table className="mb-0" responsive>
                    <thead>
                      <tr>
                        <th scope="col">Name</th>
                        <th scope="col">Username</th>
                        <th scope="col">Email</th>
                      </tr>
                    </thead>
                    <tbody>
                      {owners.map(({ user }) => (
                        <tr key={user.id}>
                          <td>{user.name}</td>
                          <td>{user.uid}</td>
                          <td>{user.email}</td>
                        </tr>
                      ))}
                    </tbody>
                  </Table>
                )}
              </div>
            </div>
          ),
        }),
      );
      return;
    }

    const courseInstances = await selectCourseInstancesWithStaffAccess({
      course,
      authzData,
    });

    const trpcUrl = getCourseTrpcUrl(res.locals.course.id);
    const trpcCsrfToken = generatePrefixCsrfToken(
      { url: trpcUrl, authn_user_id: res.locals.authn_user.id },
      config.secretKey,
    );

    res.send(
      PageLayout({
        resLocals: res.locals,
        pageTitle: 'Staff',
        navContext: {
          type: 'instructor',
          page: 'course_admin',
          subPage: 'staff',
        },
        options: {
          fullWidth: true,
          fullHeight: true,
        },
        content: (
          <Hydrate fullHeight>
            <StaffTable
              trpcCsrfToken={trpcCsrfToken}
              courseId={res.locals.course.id}
              courseInstances={courseInstances}
              courseUsers={courseUsers}
              authnUserId={res.locals.authn_user.id}
              userId={res.locals.user.id}
              isAdministrator={res.locals.is_administrator}
              uidsLimit={MAX_UIDS}
              search={getUrl(req).search}
            />
          </Hydrate>
        ),
      }),
    );
  }),
);

export default router;
