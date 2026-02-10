import * as path from 'path';

import { Router } from 'express';
import fs from 'fs-extra';
import { z } from 'zod';

import * as error from '@prairielearn/error';
import { flash } from '@prairielearn/flash';
import * as sqldb from '@prairielearn/postgres';
import { Hydrate } from '@prairielearn/react/server';
import { run } from '@prairielearn/run';

import { PageLayout } from '../../components/PageLayout.js';
import { b64EncodeUnicode } from '../../lib/base64-util.js';
import { propertyValueWithDefault } from '../../lib/editorUtil.shared.js';
import {
  AssessmentSetRenameEditor,
  FileModifyEditor,
  MultiEditor,
  getOriginalHash,
} from '../../lib/editors.js';
import { getPaths } from '../../lib/instructorFiles.js';
import { formatJsonWithPrettier } from '../../lib/prettier.js';
import { typedAsyncHandler } from '../../lib/res-locals.js';

import { AssessmentSetsPage } from './components/AssessmentSetsTable.js';
import {
  InstructorCourseAdminSetFormRowSchema,
  InstructorCourseAdminSetRowSchema,
} from './instructorCourseAdminSets.types.js';

const router = Router();
const sql = sqldb.loadSqlEquiv(import.meta.url);

router.get(
  '/',
  typedAsyncHandler<'course'>(async (_req, res) => {
    const assessmentSets = await sqldb.queryRows(
      sql.select_assessment_sets,
      { course_id: res.locals.course.id },
      InstructorCourseAdminSetRowSchema,
    );

    const assessmentSetFormState = assessmentSets.map((set) => ({
      ...set,
      trackingId: crypto.randomUUID(),
    }));

    const origHash = await getOriginalHash(path.join(res.locals.course.path, 'infoCourse.json'));

    const allowEdit =
      res.locals.authz_data.has_course_permission_edit && !res.locals.course.example_course;

    res.send(
      PageLayout({
        resLocals: res.locals,
        pageTitle: 'Assessment sets',
        navContext: {
          type: 'instructor',
          page: 'course_admin',
          subPage: 'sets',
        },
        content: (
          <Hydrate>
            <AssessmentSetsPage
              assessmentSets={assessmentSetFormState}
              allowEdit={allowEdit}
              origHash={origHash}
              csrfToken={res.locals.__csrf_token}
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

    if (req.body.__action === 'save_assessment_sets') {
      if (!(await fs.pathExists(path.join(res.locals.course.path, 'infoCourse.json')))) {
        throw new error.HttpStatusError(400, 'infoCourse.json does not exist');
      }
      const paths = getPaths(undefined, res.locals);

      const courseInfo = JSON.parse(
        await fs.readFile(path.join(res.locals.course.path, 'infoCourse.json'), 'utf8'),
      );

      const body = z
        .object({
          __action: z.literal('save_assessment_sets'),
          orig_hash: z.string(),
          assessment_sets: z
            .string()
            .transform((s) => z.array(InstructorCourseAdminSetFormRowSchema).parse(JSON.parse(s))),
        })
        .parse(req.body);

      const origHash = body.orig_hash;
      const resolveAssessmentSets = body.assessment_sets
        .map((assessmentSet) => {
          if (assessmentSet.implicit) {
            return;
          }
          return {
            abbreviation: assessmentSet.abbreviation,
            name: assessmentSet.name,
            heading: assessmentSet.heading,
            color: assessmentSet.color,
            comment: assessmentSet.json_comment || undefined,
          };
        })
        .filter(Boolean);

      // When default/implicit assessment sets are in play,
      // this will write them to the infoCourse.json file, and the course will cease to use the defaults.
      // This is intentional, as this makes them more discoverable.

      // In the UI, default/implicit assessment sets aren't synced/displayed if they aren't referenced
      // by anything. The UI already enforces this referenced-by check, so instructors using this UI
      // won't notice any difference when deleting default/implicit assessment sets.
      courseInfo.assessmentSets = propertyValueWithDefault(
        courseInfo.assessmentSets,
        resolveAssessmentSets,
        (v: any) => !v || v.length === 0,
      );

      const formattedJson = await formatJsonWithPrettier(JSON.stringify(courseInfo));

      const currentSets = await sqldb.queryRows(
        sql.select_assessment_sets,
        { course_id: res.locals.course.id },
        InstructorCourseAdminSetRowSchema,
      );

      // Build map of id -> old name (for non-implicit sets only)
      const oldNameById = new Map<string, string>();
      for (const set of currentSets) {
        if (!set.implicit) {
          oldNameById.set(set.id, set.name);
        }
      }

      // Detect renames: sets where id exists in DB and name changed
      const renames: { oldName: string; newName: string }[] = [];
      for (const newSet of body.assessment_sets) {
        if (newSet.implicit) continue;
        if (newSet.id == null) continue;
        const oldName = oldNameById.get(newSet.id);
        if (oldName && oldName !== newSet.name) {
          renames.push({ oldName, newName: newSet.name });
        }
      }

      const fileModifyEditor = new FileModifyEditor({
        locals: res.locals,
        container: {
          rootPath: paths.rootPath,
          invalidRootPaths: paths.invalidRootPaths,
        },
        filePath: path.join(res.locals.course.path, 'infoCourse.json'),
        editContents: b64EncodeUnicode(formattedJson),
        origHash,
      });

      const editor = run(() => {
        if (renames.length === 0) {
          return fileModifyEditor;
        }

        return new MultiEditor({ locals: res.locals, description: 'Update assessment sets' }, [
          ...renames.map(
            (r) =>
              new AssessmentSetRenameEditor({
                locals: res.locals,
                oldName: r.oldName,
                newName: r.newName,
              }),
          ),
          fileModifyEditor,
        ]);
      });

      const serverJob = await editor.prepareServerJob();
      try {
        await editor.executeWithServerJob(serverJob);
      } catch {
        return res.redirect(res.locals.urlPrefix + '/edit_error/' + serverJob.jobSequenceId);
      }
      flash('success', 'Assessment sets updated successfully');
      return res.redirect(req.originalUrl);
    } else {
      throw new error.HttpStatusError(400, `unknown __action: ${req.body.__action}`);
    }
  }),
);

export default router;
