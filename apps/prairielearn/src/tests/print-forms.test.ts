import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { z } from 'zod';

import { execute, loadSqlEquiv, queryRow, queryRows, queryScalars } from '@prairielearn/postgres';
import { IdSchema } from '@prairielearn/zod';

import { makeAssessmentInstance, updateAssessmentInstance } from '../lib/assessment.js';
import { VariantSchema } from '../lib/db-types.js';
import { createPrintForm } from '../lib/print-forms.js';
import { selectAssessmentByTid } from '../models/assessment.js';
import { selectCourseInstanceById } from '../models/course-instances.js';
import { selectCourseById } from '../models/course.js';
import { selectPrintFormQuestions } from '../models/print-form-question.js';
import { selectOptionalPrintForm, selectPrintFormsForUser } from '../models/print-form.js';

import { runInTransactionAndRollback } from './helperDb.js';
import * as helperServer from './helperServer.js';
import { getConfiguredUser, getOrCreateUser } from './utils/auth.js';

const sql = loadSqlEquiv(import.meta.url);

describe('print forms', { timeout: 60_000 }, () => {
  beforeAll(helperServer.before());
  afterAll(helperServer.after);

  it('saves independent forms and variants with assessment preferences and ownership', () =>
    runInTransactionAndRollback(async () => {
      const courseInstance = await selectCourseInstanceById('1');
      const course = await selectCourseById(courseInstance.course_id);
      const assessment = await selectAssessmentByTid({
        course_instance_id: courseInstance.id,
        tid: 'hw17-questionPreferences',
      });
      const authnUser = await getConfiguredUser();
      const owner = await getOrCreateUser({
        uid: 'print-owner@example.com',
        name: 'Print owner',
        uin: 'print-owner',
      });
      const before = await queryRow(
        sql.count_student_records,
        z.object({
          assessments: z.number(),
          questions: z.number(),
        }),
      );
      await execute(sql.set_preferences, {
        assessment_id: assessment.id,
        preferences: JSON.stringify({ gravitational_constant: 13 }),
      });
      const options = {
        assessment,
        course,
        courseInstance,
        userId: owner.id,
        authnUserId: authnUser.id,
      };

      const form = await createPrintForm(options);
      const rows = await selectPrintFormQuestions(form.id);
      expect(rows).toHaveLength(1);
      const saved = rows[0].print_form_question;
      const variant = await queryRow(
        sql.select_variant,
        { variant_id: saved.variant_id },
        VariantSchema,
      );
      expect(variant.instance_question_id).toBeNull();
      expect(variant.user_id).toBe(owner.id);
      expect(variant.authn_user_id).toBe(authnUser.id);
      expect(variant.preferences).toEqual({
        gravitational_constant: 13,
        fired_object: 'cannon ball',
      });
      expect(variant.true_answer!.force).toBe(Number(variant.params!.m) * 13);
      expect(saved.position).toBe(1);
      expect(saved.question_number).toBe('HW17.1');
      expect(saved.max_points).toBe(rows[0].assessment_question.max_points);
      expect(
        await selectOptionalPrintForm({
          printFormId: form.id,
          assessmentId: assessment.id,
          userId: authnUser.id,
        }),
      ).toBeNull();
      expect(
        await selectPrintFormsForUser({ assessmentId: assessment.id, userId: owner.id }),
      ).toEqual([form]);

      const regenerated = await createPrintForm(options);
      expect(regenerated.id).not.toBe(form.id);
      const regeneratedQuestions = await selectPrintFormQuestions(regenerated.id);
      expect(regeneratedQuestions[0].print_form_question.variant_id).not.toBe(variant.id);
      expect(
        await queryRow(
          sql.count_student_records,
          z.object({
            assessments: z.number(),
            questions: z.number(),
          }),
        ),
      ).toEqual(before);

      await execute(sql.remove_source_question, {
        assessment_question_id: saved.assessment_question_id,
      });
      const reread = await selectPrintFormQuestions(form.id);
      expect(reread[0].print_form_question).toEqual(saved);
      expect(reread[0].assessment_question.deleted_at).not.toBeNull();
    }));

  it('shares alternative-group and zone selection with student instances without changing saved questions', () =>
    runInTransactionAndRollback(async () => {
      const courseInstance = await selectCourseInstanceById('1');
      const course = await selectCourseById(courseInstance.course_id);
      const assessment = await selectAssessmentByTid({
        course_instance_id: courseInstance.id,
        tid: 'exam23-printing',
      });
      const user = await getConfiguredUser();
      await execute(sql.group_alternatives, { assessment_id: assessment.id });
      await execute(sql.remove_unused_questions, { assessment_id: assessment.id });
      await execute(sql.limit_alternatives, { assessment_id: assessment.id });
      await execute(sql.limit_zones, { assessment_id: assessment.id });
      const chosen = await queryScalars(
        sql.select_chosen_questions,
        {
          assessment_id: assessment.id,
          existing_ids: [],
        },
        IdSchema,
      );
      expect(chosen).toHaveLength(2);
      const groups = await queryScalars(
        sql.select_question_groups,
        { question_ids: chosen },
        IdSchema,
      );
      expect(new Set(groups).size).toBe(2);
      const retained = await queryScalars(
        sql.select_chosen_questions,
        {
          assessment_id: assessment.id,
          existing_ids: chosen,
        },
        IdSchema,
      );
      expect(retained.sort()).toEqual(chosen.sort());

      const instanceId = await makeAssessmentInstance({
        assessment,
        user_id: user.id,
        authn_user_id: user.id,
        mode: 'Public',
        time_limit_min: null,
        date: new Date(),
        client_fingerprint_id: null,
      });
      const studentQuestions = await queryRows(
        sql.select_student_questions,
        {
          assessment_instance_id: instanceId,
        },
        z.object({ id: IdSchema, assessment_question_id: IdSchema }),
      );
      expect(studentQuestions).toHaveLength(2);
      await updateAssessmentInstance(instanceId, user.id);
      expect(
        await queryRows(
          sql.select_student_questions,
          {
            assessment_instance_id: instanceId,
          },
          z.object({ id: IdSchema, assessment_question_id: IdSchema }),
        ),
      ).toEqual(studentQuestions);

      const form = await createPrintForm({
        assessment,
        course,
        courseInstance,
        userId: user.id,
        authnUserId: user.id,
      });
      const formQuestions = await selectPrintFormQuestions(form.id);
      expect(formQuestions.map(({ print_form_question }) => print_form_question.position)).toEqual([
        1, 2,
      ]);
      expect(
        formQuestions.map(({ print_form_question }) => print_form_question.question_number),
      ).toEqual(['1', '2']);
    }));
});
