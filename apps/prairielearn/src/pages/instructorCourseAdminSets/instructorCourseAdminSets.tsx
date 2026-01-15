import * as path from 'path';

import { Router } from 'express';
import fs from 'fs-extra';
import { z } from 'zod';

import * as error from '@prairielearn/error';
import { flash } from '@prairielearn/flash';
import * as sqldb from '@prairielearn/postgres';
import { Hydrate } from '@prairielearn/react/server';

import { PageLayout } from '../../components/PageLayout.js';
import { b64EncodeUnicode } from '../../lib/base64-util.js';
import { extractPageContext } from '../../lib/client/page-context.js';
import { StaffAssessmentSetSchema } from '../../lib/client/safe-db-types.js';
import { AssessmentSetSchema } from '../../lib/db-types.js';
import { FileModifyEditor, getOrigHash, propertyValueWithDefault } from '../../lib/editors.js';
import { getPaths } from '../../lib/instructorFiles.js';
import { formatJsonWithPrettier } from '../../lib/prettier.js';
import { typedAsyncHandler } from '../../lib/res-locals.js';

import { AssessmentSetsPage } from './components/AssessmentSetsTable.js';

const router = Router();
const sql = sqldb.loadSqlEquiv(import.meta.url);

router.get(
  '/',
  typedAsyncHandler<'course'>(async (req, res) => {
    const pageContext = extractPageContext(res.locals, {
      pageType: 'course',
      accessType: 'instructor',
    });

    const assessmentSets = await sqldb.queryRows(
      sql.select_assessment_sets,
      { course_id: pageContext.course.id },
      StaffAssessmentSetSchema,
    );

    const origHash = await getOrigHash(path.join(pageContext.course.path, 'infoCourse.json'));

    const allowEdit =
      pageContext.authz_data.has_course_permission_edit && !pageContext.course.example_course;

    res.send(
      PageLayout({
        resLocals: res.locals,
        pageTitle: 'Assessment Sets',
        navContext: {
          type: 'instructor',
          page: 'course_admin',
          subPage: 'sets',
        },
        options: {
          fullWidth: true,
        },
        content: (
          <Hydrate>
            <AssessmentSetsPage
              assessmentSets={assessmentSets}
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
    const pageContext = extractPageContext(res.locals, {
      pageType: 'course',
      accessType: 'instructor',
    });

    if (!pageContext.authz_data.has_course_permission_edit) {
      throw new error.HttpStatusError(403, 'Access denied (must be course editor)');
    }

    if (pageContext.course.example_course) {
      throw new error.HttpStatusError(403, 'Access denied. Cannot make changes to example course.');
    }

    if (req.body.__action === 'save_assessment_sets') {
      if (!(await fs.pathExists(path.join(pageContext.course.path, 'infoCourse.json')))) {
        throw new error.HttpStatusError(400, 'infoCourse.json does not exist');
      }
      const paths = getPaths(undefined, res.locals);

      const courseInfo = JSON.parse(
        await fs.readFile(path.join(pageContext.course.path, 'infoCourse.json'), 'utf8'),
      );

      const body = z
        .object({
          orig_hash: z.string(),
          assessment_sets: z.string().transform((s) =>
            z
              .array(
                AssessmentSetSchema.pick({
                  name: true,
                  color: true,
                  heading: true,
                  abbreviation: true,
                  json_comment: true,
                  implicit: true,
                }),
              )
              .parse(JSON.parse(s)),
          ),
        })
        .parse(req.body);

      const origHash = body.orig_hash;
      const resolveAssessmentSets = body.assessment_sets
        .map((assessmentSet) => {
          if (assessmentSet.implicit) {
            return;
          }
          return {
            name: assessmentSet.name,
            color: assessmentSet.color,
            heading: assessmentSet.heading,
            abbreviation: assessmentSet.abbreviation,
            comment: assessmentSet.json_comment || undefined,
          };
        })
        .filter(Boolean);

      courseInfo.assessmentSets = propertyValueWithDefault(
        courseInfo.assessmentSets,
        resolveAssessmentSets,
        (v: any) => !v || v.length === 0,
      );

      const formattedJson = await formatJsonWithPrettier(JSON.stringify(courseInfo));

      const editor = new FileModifyEditor({
        locals: res.locals,
        container: {
          rootPath: paths.rootPath,
          invalidRootPaths: paths.invalidRootPaths,
        },
        filePath: path.join(pageContext.course.path, 'infoCourse.json'),
        editContents: b64EncodeUnicode(formattedJson),
        origHash,
      });
      const serverJob = await editor.prepareServerJob();
      try {
        await editor.executeWithServerJob(serverJob);
      } catch {
        return res.redirect(pageContext.urlPrefix + '/edit_error/' + serverJob.jobSequenceId);
      }
      flash('success', 'Assessment sets updated successfully');
      return res.redirect(req.originalUrl);
    } else {
      throw new error.HttpStatusError(400, `unknown __action: ${req.body.__action}`);
    }
  }),
);

export default router;
