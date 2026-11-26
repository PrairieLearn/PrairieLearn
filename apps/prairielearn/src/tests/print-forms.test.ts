import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { z } from 'zod';

import { execute, loadSqlEquiv, queryRow, queryRows, queryScalars } from '@prairielearn/postgres';
import { IdSchema } from '@prairielearn/zod';

import { makeAssessmentInstance, updateAssessmentInstance } from '../lib/assessment.js';
import { nextPrintFormLabel } from '../lib/client/printing/print-form-label.js';
import { VariantSchema } from '../lib/db-types.js';
import { createPrintForm, ensureInitialPrintForm } from '../lib/printing/print-forms.js';
import { selectAssessmentByTid } from '../models/assessment.js';
import { selectCourseInstanceById } from '../models/course-instances.js';
import { selectCourseById } from '../models/course.js';
import { selectPrintFormQuestions } from '../models/print-form-question.js';
import {
  archivePrintForm,
  lockPrintFormQuestionSelections,
  selectActivePrintFormsForAssessment,
  selectOptionalPrintForm,
  selectPrintFormsForAssessment,
} from '../models/print-form.js';

import { runInTransactionAndRollback } from './helperDb.js';
import * as helperServer from './helperServer.js';
import { getConfiguredUser, getOrCreateUser } from './utils/auth.js';

const sql = loadSqlEquiv(import.meta.url);

describe('print forms', { timeout: 60_000 }, () => {
  beforeAll(helperServer.before());
  afterAll(helperServer.after);

  it('versions the first vacant letter slot', () => {
    const form = (label: string, archived = false) => ({
      label,
      archived_at: archived ? new Date() : null,
    });
    expect(nextPrintFormLabel([])).toBe('A1');
    expect(nextPrintFormLabel([form('A1')], 'A1')).toBe('A2');
    expect(nextPrintFormLabel([form('A')], 'A')).toBe('A2');
    expect(nextPrintFormLabel([form('A1', true), form('A2')], 'A2')).toBe('A3');
    expect(nextPrintFormLabel([form('A1'), form('B1'), form('C1', true)])).toBe('C2');
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

      const form = await ensureInitialPrintForm(options);
      expect(form.label).toBe('A1');
      expect((await ensureInitialPrintForm(options)).id).toBe(form.id);
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
      const rerandomized = await createPrintForm({
        ...options,
        userId: authnUser.id,
        replacesPrintFormId: form.id,
      });
      expect(rerandomized).toEqual(form);
      const rerandomizedQuestions = await selectPrintFormQuestions(form.id);
      expect(rerandomizedQuestions[0].print_form_question).toMatchObject({
        id: saved.id,
        assessment_question_id: saved.assessment_question_id,
        position: saved.position,
        question_number: saved.question_number,
        max_points: saved.max_points,
      });
      expect(rerandomizedQuestions[0].print_form_question.variant_id).not.toBe(saved.variant_id);
      await lockPrintFormQuestionSelections({
        assessmentId: assessment.id,
        printFormIds: [form.id],
      });
      const regenerated = await createPrintForm({
        ...options,
        userId: authnUser.id,
        replacesPrintFormId: form.id,
      });
      expect(regenerated.id).not.toBe(form.id);
      expect(regenerated.label).toBe('A2');
      expect((await ensureInitialPrintForm(options)).id).toBe(regenerated.id);
      expect(regenerated.archived_at).toBeNull();
      const regeneratedQuestions = await selectPrintFormQuestions(regenerated.id);
      expect(regeneratedQuestions[0].print_form_question.variant_id).not.toBe(
        rerandomizedQuestions[0].print_form_question.variant_id,
      );
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
      const formB = await createPrintForm(options);
      const formC = await createPrintForm(options);
      expect([formB.label, formC.label]).toEqual(['B1', 'C1']);
      await archivePrintForm({ printFormId: formC.id, assessmentId: assessment.id });
      const replacementC = await createPrintForm(options);
      expect(replacementC.label).toBe('C2');
      expect(
        (await selectActivePrintFormsForAssessment({ assessmentId: assessment.id })).map(
          (activeForm) => activeForm.label,
        ),
      ).toEqual(['C2', 'B1', 'A2']);
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
      expect(reread[0].print_form_question).toEqual(rerandomizedQuestions[0].print_form_question);
      expect(reread[0].assessment_question.deleted_at).not.toBeNull();
    }));

  it('applies alternative-group and zone selection to print forms without changing student instances', () =>
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
      const groups = await queryScalars(
        sql.select_question_groups,
        {
          question_ids: formQuestions.map(
            ({ print_form_question }) => print_form_question.assessment_question_id,
          ),
        },
        IdSchema,
      );
      expect(new Set(groups).size).toBe(2);
    }));
});
