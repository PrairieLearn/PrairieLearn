import * as path from 'path';

import sha256 from 'crypto-js/sha256.js';
import { Router } from 'express';
import asyncHandler from 'express-async-handler';
import fs from 'fs-extra';
import { z } from 'zod';

import * as error from '@prairielearn/error';
import { flash } from '@prairielearn/flash';
import { Hydrate } from '@prairielearn/preact/server';

import { PageLayout } from '../../components/PageLayout.js';
import { CourseSyncErrorsAndWarnings } from '../../components/SyncErrorsAndWarnings.js';
import { b64EncodeUnicode } from '../../lib/base64-util.js';
import { extractPageContext } from '../../lib/client/page-context.js';
import { StaffTopicSchema } from '../../lib/client/safe-db-types.js';
import { TopicSchema } from '../../lib/db-types.js';
import { FileModifyEditor, propertyValueWithDefault } from '../../lib/editors.js';
import { getPaths } from '../../lib/instructorFiles.js';
import { formatJsonWithPrettier } from '../../lib/prettier.js';
import { selectTopicsByCourseId } from '../../models/topics.js';

import { InstructorCourseAdminTopicsTable } from './components/InstructorCourseAdminTopicsTable.js';

const router = Router();

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const pageContext = extractPageContext(res.locals, {
      pageType: 'course',
      accessType: 'instructor',
    });

    const topics = await selectTopicsByCourseId(pageContext.course.id);

    const courseInfoExists = await fs.pathExists(
      path.join(pageContext.course.path, 'infoCourse.json'),
    );
    let origHash: string | null = null;
    if (courseInfoExists) {
      origHash = sha256(
        b64EncodeUnicode(
          await fs.readFile(path.join(pageContext.course.path, 'infoCourse.json'), 'utf8'),
        ),
      ).toString();
    }

    const allowEdit =
      pageContext.authz_data.has_course_permission_edit && !pageContext.course.example_course;

    res.send(
      PageLayout({
        resLocals: res.locals,
        pageTitle: 'Topics',
        navContext: {
          type: 'instructor',
          page: 'course_admin',
          subPage: 'topics',
        },
        options: {
          fullWidth: true,
        },
        content: (
          <>
            <CourseSyncErrorsAndWarnings
              authzData={res.locals.authz_data}
              course={pageContext.course}
              urlPrefix={pageContext.urlPrefix}
            />
            <Hydrate>
              <InstructorCourseAdminTopicsTable
                topics={z.array(StaffTopicSchema).parse(topics)}
                allowEdit={allowEdit}
                csrfToken={pageContext.__csrf_token}
                origHash={origHash}
              />
            </Hydrate>
          </>
        ),
      }),
    );
  }),
);

router.post(
  '/',
  asyncHandler(async (req, res) => {
    if (!res.locals.authz_data.has_course_permission_edit) {
      throw new error.HttpStatusError(403, 'Access denied (must be course editor)');
    }

    if (res.locals.course.example_course) {
      throw new error.HttpStatusError(403, 'Access denied. Cannot make changes to example course.');
    }

    if (req.body.__action === 'save_topics') {
      if (!(await fs.pathExists(path.join(res.locals.course.path, 'infoCourse.json')))) {
        throw new error.HttpStatusError(400, 'infoCourse.json does not exist');
      }
      const paths = getPaths(undefined, res.locals);

      const courseInfo = JSON.parse(
        await fs.readFile(path.join(res.locals.course.path, 'infoCourse.json'), 'utf8'),
      );

      const body = z
        .object({
          orig_hash: z.string(),
          topics: z.string().transform((s) =>
            z
              .array(
                TopicSchema.pick({
                  name: true,
                  color: true,
                  description: true,
                  json_comment: true,
                  implicit: true,
                }),
              )
              .parse(JSON.parse(s)),
          ),
        })
        .parse(req.body);

      const origHash = body.orig_hash;
      const resolveTopics = body.topics
        .map((topic) => {
          if (topic.implicit) {
            return;
          }
          return {
            name: topic.name,
            color: topic.color,
            description: topic.description || undefined,
            comment: topic.json_comment || undefined,
          };
        })
        .filter(Boolean);

      courseInfo.topics = propertyValueWithDefault(
        courseInfo.topics,
        resolveTopics,
        (v) => !v || v.length === 0,
      );

      const formattedJson = await formatJsonWithPrettier(JSON.stringify(courseInfo));

      const editor = new FileModifyEditor({
        locals: res.locals as any,
        container: {
          rootPath: paths.rootPath,
          invalidRootPaths: paths.invalidRootPaths,
        },
        filePath: path.join(res.locals.course.path, 'infoCourse.json'),
        editContents: b64EncodeUnicode(formattedJson),
        origHash,
      });
      const serverJob = await editor.prepareServerJob();
      try {
        await editor.executeWithServerJob(serverJob);
      } catch {
        return res.redirect(res.locals.urlPrefix + '/edit_error/' + serverJob.jobSequenceId);
      }
      flash('success', 'Topic configuration updated successfully');
      return res.redirect(req.originalUrl);
    } else {
      throw new error.HttpStatusError(400, `unknown __action: ${req.body.__action}`);
    }
  }),
);

export default router;
