import * as path from 'path';

import { Router } from 'express';
import fs from 'fs-extra';
import { z } from 'zod';

import * as error from '@prairielearn/error';
import { flash } from '@prairielearn/flash';
import { Hydrate } from '@prairielearn/react/server';

import { PageLayout } from '../../components/PageLayout.js';
import { TagsTopicsTable } from '../../components/TagsTopicsTable.js';
import { b64EncodeUnicode } from '../../lib/base64-util.js';
import { extractPageContext } from '../../lib/client/page-context.js';
import { StaffTopicSchema } from '../../lib/client/safe-db-types.js';
import { TopicSchema } from '../../lib/db-types.js';
import { propertyValueWithDefault } from '../../lib/editorUtil.shared.js';
import { FileModifyEditor, getOriginalHash } from '../../lib/editors.js';
import { getPaths } from '../../lib/instructorFiles.js';
import { formatJsonWithPrettier } from '../../lib/prettier.js';
import { typedAsyncHandler } from '../../lib/res-locals.js';
import { selectTopicsByCourseId } from '../../models/topics.js';

const router = Router();

router.get(
  '/',
  typedAsyncHandler<'course'>(async (req, res) => {
    const pageContext = extractPageContext(res.locals, {
      pageType: 'course',
      accessType: 'instructor',
    });

    const topics = await selectTopicsByCourseId(pageContext.course.id);

    const origHash = await getOriginalHash(path.join(pageContext.course.path, 'infoCourse.json'));

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
        content: (
          <Hydrate>
            <TagsTopicsTable
              entities={z.array(StaffTopicSchema).parse(topics)}
              entityType="topic"
              allowEdit={allowEdit}
              origHash={origHash}
              csrfToken={pageContext.__csrf_token}
            />
          </Hydrate>
        ),
      }),
    );
  }),
);

router.post(
  '/',
  typedAsyncHandler<'course'>(async (req, res) => {
    if (!res.locals.authz_data.has_course_permission_edit) {
      throw new error.HttpStatusError(403, 'Access denied (must be course editor)');
    }

    if (res.locals.course.example_course) {
      throw new error.HttpStatusError(403, 'Access denied. Cannot make changes to example course.');
    }

    if (req.body.__action === 'save_data') {
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
          data: z.string().transform((s) =>
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
      const resolveTopics = body.data
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
        (v: any) => !v || v.length === 0,
      );

      const formattedJson = await formatJsonWithPrettier(JSON.stringify(courseInfo));

      const editor = new FileModifyEditor({
        locals: res.locals,
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
      flash('success', 'Topics updated successfully');
      return res.redirect(req.originalUrl);
    } else {
      throw new error.HttpStatusError(400, `unknown __action: ${req.body.__action}`);
    }
  }),
);

export default router;
