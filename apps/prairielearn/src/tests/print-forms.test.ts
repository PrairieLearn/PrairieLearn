import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { z } from 'zod';

import { execute, loadSqlEquiv, queryRow, queryRows, queryScalars } from '@prairielearn/postgres';
import { IdSchema } from '@prairielearn/zod';

import { makeAssessmentInstance, updateAssessmentInstance } from '../lib/assessment.js';
import { VariantSchema } from '../lib/db-types.js';
import { createPrintForm, nextPrintFormLabel } from '../lib/printing/print-forms.js';
import { selectAssessmentByTid } from '../models/assessment.js';
import { selectCourseInstanceById } from '../models/course-instances.js';
import { selectCourseById } from '../models/course.js';
import { selectPrintFormQuestions } from '../models/print-form-question.js';
import {
  archivePrintForm,
  selectActivePrintFormsForAssessment,
  selectOptionalPrintForm,
  selectPrintFormsForAssessment,
} from '../models/print-form.js';
import { selectAndAuthzVariant } from '../models/variant.js';

import { runInTransactionAndRollback } from './helperDb.js';
import * as helperServer from './helperServer.js';
import { getConfiguredUser, getOrCreateUser } from './utils/auth.js';

const sql = loadSqlEquiv(import.meta.url);

describe('print forms', { timeout: 60_000 }, () => {
  beforeAll(helperServer.before());
  afterAll(helperServer.after);

  it.each([
    [null, 'A'],
    ['A', 'B'],
    ['Z', 'AA'],
    ['AZ', 'BA'],
    ['ZZ', 'AAA'],
  ])('assigns the label after %s as %s', (previous, expected) => {
    expect(nextPrintFormLabel(previous)).toBe(expected);
  });

  it('saves assessment-shared form versions without creating student records', () =>
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
      expect(form.label).toMatch(/^[A-Z]+$/);
      expect(form.archived_at).toBeNull();
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
        }),
      ).toEqual(form);
      expect(
        await selectActivePrintFormsForAssessment({ assessmentId: assessment.id }),
      ).toContainEqual(form);
      const sharedVariantAccess = {
        unsafe_variant_id: variant.id,
        variant_course: { ...course, example_course: true },
        question_id: rows[0].question.id,
        course_instance_id: courseInstance.id,
        assessment_id: assessment.id,
        authz_data: { has_course_permission_preview: true },
        authn_user: authnUser,
        user: authnUser,
        is_administrator: false,
      };
      await expect(selectAndAuthzVariant(sharedVariantAccess)).rejects.toMatchObject({
        status: 403,
      });
      expect(
        (
          await selectAndAuthzVariant({
            ...sharedVariantAccess,
            print_form_question_id: saved.id,
          })
        ).id,
      ).toBe(variant.id);

      const regenerated = await createPrintForm({
        ...options,
        userId: authnUser.id,
        replacesPrintFormId: form.id,
      });
      expect(regenerated.id).not.toBe(form.id);
      expect(regenerated.label).not.toBe(form.label);
      expect(regenerated.archived_at).toBeNull();
      const regeneratedQuestions = await selectPrintFormQuestions(regenerated.id);
      expect(regeneratedQuestions[0].print_form_question.variant_id).not.toBe(variant.id);
      const archived = await selectOptionalPrintForm({
        printFormId: form.id,
        assessmentId: assessment.id,
      });
      expect(archived).toMatchObject({ id: form.id, label: form.label });
      expect(archived?.archived_at).not.toBeNull();
      expect(
        await selectActivePrintFormsForAssessment({ assessmentId: assessment.id }),
      ).toContainEqual(regenerated);
      expect(
        await selectActivePrintFormsForAssessment({ assessmentId: assessment.id }),
      ).not.toContainEqual(archived);
      expect(await selectPrintFormsForAssessment({ assessmentId: assessment.id })).toEqual(
        expect.arrayContaining([regenerated, archived]),
      );
      await expect(
        createPrintForm({ ...options, replacesPrintFormId: form.id }),
      ).rejects.toMatchObject({ status: 404 });
      expect(
        await archivePrintForm({ printFormId: regenerated.id, assessmentId: assessment.id }),
      ).toMatchObject({ id: regenerated.id, label: regenerated.label });
      expect(
        await selectActivePrintFormsForAssessment({ assessmentId: assessment.id }),
      ).not.toContainEqual(regenerated);
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
