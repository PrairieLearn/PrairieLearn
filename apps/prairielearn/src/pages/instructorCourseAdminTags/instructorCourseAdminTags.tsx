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
import { StaffTagSchema } from '../../lib/client/safe-db-types.js';
import { TagSchema } from '../../lib/db-types.js';
import { propertyValueWithDefault } from '../../lib/editorUtil.shared.js';
import { FileModifyEditor, getOriginalHash } from '../../lib/editors.js';
import { getPaths } from '../../lib/instructorFiles.js';
import { formatJsonWithPrettier } from '../../lib/prettier.js';
import { typedAsyncHandler } from '../../lib/res-locals.js';
import { selectTagsByCourseId } from '../../models/tags.js';

const router = Router();

router.get(
  '/',
  typedAsyncHandler<'course'>(async (req, res) => {
    const pageContext = extractPageContext(res.locals, {
      pageType: 'course',
      accessType: 'instructor',
    });
    const tags = await selectTagsByCourseId(pageContext.course.id);

    const origHash = await getOriginalHash(path.join(pageContext.course.path, 'infoCourse.json'));

    const allowEdit =
      pageContext.authz_data.has_course_permission_edit && !pageContext.course.example_course;

    res.send(
      PageLayout({
        resLocals: res.locals,
        pageTitle: 'Tags',
        navContext: {
          type: 'instructor',
          page: 'course_admin',
          subPage: 'tags',
        },
        content: (
          <Hydrate>
            <TagsTopicsTable
              entities={z.array(StaffTagSchema).parse(tags)}
              entityType="tag"
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
                TagSchema.pick({
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
      const resolveTags = body.data
        .map((tag) => {
          if (tag.implicit) {
            return;
          }
          return {
            name: tag.name,
            color: tag.color,
            description: tag.description || undefined,
            comment: tag.json_comment || undefined,
          };
        })
        .filter(Boolean);

      courseInfo.tags = propertyValueWithDefault(
        courseInfo.tags,
        resolveTags,
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
      flash('success', 'Tags updated successfully');
      return res.redirect(req.originalUrl);
    } else {
      throw new error.HttpStatusError(400, `unknown __action: ${req.body.__action}`);
    }
  }),
);

export default router;
