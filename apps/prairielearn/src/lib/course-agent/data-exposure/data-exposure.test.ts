import { afterAll, assert, beforeAll, describe, expect, it } from 'vitest';
import { z } from 'zod';

import { HttpStatusError } from '@prairielearn/error';
import { execute, queryRow, queryRows } from '@prairielearn/postgres';
import { IdSchema } from '@prairielearn/zod';

import * as helperDb from '../../../tests/helperDb.js';

import {
  COURSE_AGENT_RELATIONS,
  type CourseAgentAuthzContext,
  assertCanAccessRelation,
  bindScopeParams,
  buildRelationScopePredicate,
  getCourseAgentLogicalSchema,
  getCourseAgentRelation,
  loadPublicCatalog,
  validateCourseAgentManifest,
} from './index.js';

function ctx(
  overrides: Partial<CourseAgentAuthzContext> & Pick<CourseAgentAuthzContext, 'courseId'>,
): CourseAgentAuthzContext {
  return {
    courseInstanceId: null,
    isAdministrator: false,
    isInstitutionAdministrator: false,
    hasCoursePermissionPreview: false,
    hasCoursePermissionView: false,
    hasCourseInstancePermissionView: false,
    ...overrides,
  };
}

async function scopedIds(
  relationName: string,
  context: CourseAgentAuthzContext,
): Promise<string[]> {
  const relation = getCourseAgentRelation(relationName);
  assert.isDefined(relation);
  assertCanAccessRelation(relation, context);
  const predicate = buildRelationScopePredicate({ relation, context, sourceAlias: 'src' });
  const idColumn = relation.columns.some((column) => column.name === 'id')
    ? 'id'
    : relation.columns[0].name;
  const bound = bindScopeParams(
    `SELECT src.${idColumn}::text AS id FROM ${relation.sourceTable} AS src WHERE ${predicate}`,
    context,
  );
  return await queryRows(
    bound.text,
    bound.values,
    z.object({ id: z.string() }).transform((row) => row.id),
  );
}

describe('course-agent data exposure', () => {
  beforeAll(helperDb.before);
  afterAll(helperDb.after);

  describe('manifest contract', () => {
    it('matches pg_catalog tables, columns, types, and foreign-key paths', async () => {
      const catalog = await loadPublicCatalog();
      expect(
        validateCourseAgentManifest({
          columns: catalog.columns,
          foreignKeys: catalog.foreignKeys,
        }),
      ).toEqual([]);
    });

    it('fails closed when a column is missing or a type changes', async () => {
      const catalog = await loadPublicCatalog();
      const [relation] = COURSE_AGENT_RELATIONS;
      const missing = validateCourseAgentManifest({
        relations: [
          {
            ...relation,
            columns: [...relation.columns, { name: 'not_a_real_column', pgType: 'text' }],
          },
        ],
        columns: catalog.columns,
        foreignKeys: catalog.foreignKeys,
      });
      expect(missing.some((failure) => failure.code === 'missing_column')).toBe(true);

      const typeChanged = validateCourseAgentManifest({
        relations: [
          {
            ...relation,
            columns: relation.columns.map((column, index) =>
              index === 0 ? { ...column, pgType: 'text' } : column,
            ),
          },
        ],
        columns: catalog.columns,
        foreignKeys: catalog.foreignKeys,
      });
      expect(typeChanged.some((failure) => failure.code === 'type_mismatch')).toBe(true);
    });

    it('detects missing foreign keys, cycles, and unresolved scope paths', async () => {
      const catalog = await loadPublicCatalog();
      const relation = getCourseAgentRelation('grading_jobs');
      assert.isDefined(relation);

      const missingFk = validateCourseAgentManifest({
        relations: [
          {
            ...relation,
            scopePath: {
              kind: 'single',
              hops: [
                {
                  fromTable: 'grading_jobs',
                  fromColumns: ['submission_id'],
                  toTable: 'courses',
                  toColumns: ['id'],
                  direction: 'outgoing',
                },
              ],
            },
          },
        ],
        columns: catalog.columns,
        foreignKeys: catalog.foreignKeys,
      });
      expect(missingFk.some((failure) => failure.code === 'missing_foreign_key')).toBe(true);

      const cycle = validateCourseAgentManifest({
        relations: [
          {
            ...relation,
            scopePath: {
              kind: 'single',
              hops: [
                {
                  fromTable: 'grading_jobs',
                  fromColumns: ['submission_id'],
                  toTable: 'submissions',
                  toColumns: ['id'],
                  direction: 'outgoing',
                },
                {
                  fromTable: 'submissions',
                  fromColumns: ['variant_id'],
                  toTable: 'variants',
                  toColumns: ['id'],
                  direction: 'outgoing',
                },
                {
                  fromTable: 'variants',
                  fromColumns: ['id'],
                  toTable: 'submissions',
                  toColumns: ['variant_id'],
                  direction: 'incoming',
                },
              ],
            },
          },
        ],
        columns: catalog.columns,
        foreignKeys: catalog.foreignKeys,
      });
      expect(cycle.some((failure) => failure.code === 'cycle')).toBe(true);

      const unresolved = validateCourseAgentManifest({
        relations: [
          {
            ...relation,
            scopePath: { kind: 'single', hops: [] },
          },
        ],
        columns: catalog.columns,
        foreignKeys: catalog.foreignKeys,
      });
      expect(unresolved.some((failure) => failure.code === 'unresolved_scope_path')).toBe(true);
    });

    it('exposes a versioned logical schema for the DSL and tools', () => {
      const schema = getCourseAgentLogicalSchema();
      expect(schema.version).toBe(1);
      expect(schema.relations.map((relation) => relation.name)).toContain('enrolled_users');
      expect(schema.relations.find((relation) => relation.name === 'users')).toBeUndefined();
      const enrolled = schema.relations.find((relation) => relation.name === 'enrolled_users');
      expect(enrolled?.columns).not.toContain('stripe_customer_id');
    });
  });

  describe('authorization', () => {
    const assessments = getCourseAgentRelation('assessments');
    const submissions = getCourseAgentRelation('submissions');
    const questions = getCourseAgentRelation('questions');
    assert.isDefined(assessments);
    assert.isDefined(submissions);
    assert.isDefined(questions);

    it('denies student data without course-instance view permission', () => {
      expect(() =>
        assertCanAccessRelation(
          submissions,
          ctx({
            courseId: '1',
            courseInstanceId: '10',
            hasCoursePermissionView: true,
          }),
        ),
      ).toThrow(HttpStatusError);
    });

    it('allows instance-linked configuration for course-instance staff without course preview', () => {
      assertCanAccessRelation(
        assessments,
        ctx({
          courseId: '1',
          courseInstanceId: '10',
          hasCourseInstancePermissionView: true,
        }),
      );
      assertCanAccessRelation(
        questions,
        ctx({
          courseId: '1',
          courseInstanceId: '10',
          hasCourseInstancePermissionView: true,
        }),
      );
    });

    it('allows student data for institution administrators in an explicit instance', () => {
      assertCanAccessRelation(
        submissions,
        ctx({
          courseId: '1',
          courseInstanceId: '10',
          isInstitutionAdministrator: true,
        }),
      );
    });

    it('denies student data for institution administrators without a course instance', () => {
      expect(() =>
        assertCanAccessRelation(
          submissions,
          ctx({
            courseId: '1',
            isInstitutionAdministrator: true,
          }),
        ),
      ).toThrow(HttpStatusError);
    });
  });

  describe('row scoping', () => {
    let courseA: string;
    let courseB: string;
    let instanceA1: string;
    let instanceA2: string;
    let instanceB: string;
    let questionA: string;
    let questionB: string;
    let assessmentA1: string;
    let assessmentA2: string;
    let userEnrolled: string;
    let userOther: string;

    beforeAll(async () => {
      await helperDb.resetDatabase();
      courseA = await queryRow(
        `INSERT INTO courses (display_timezone, path, short_name, title)
         VALUES ('UTC', 'course-a', 'A', 'Course A') RETURNING id`,
        {},
        IdSchema,
      );
      courseB = await queryRow(
        `INSERT INTO courses (display_timezone, path, short_name, title)
         VALUES ('UTC', 'course-b', 'B', 'Course B') RETURNING id`,
        {},
        IdSchema,
      );

      const insertInstance = async (courseId: string, shortName: string, code: string) =>
        await queryRow(
          `INSERT INTO course_instances (course_id, display_timezone, short_name, enrollment_code)
           VALUES ($course_id, 'UTC', $short_name, $enrollment_code) RETURNING id`,
          { course_id: courseId, short_name: shortName, enrollment_code: code },
          IdSchema,
        );

      instanceA1 = await insertInstance(courseA, 'FaA1', 'aaaaaa');
      instanceA2 = await insertInstance(courseA, 'FaA2', 'bbbbbb');
      instanceB = await insertInstance(courseB, 'FaB', 'cccccc');

      questionA = await queryRow(
        `INSERT INTO questions (course_id, qid, title, uuid)
         VALUES ($course_id, 'qA', 'Question A', gen_random_uuid()) RETURNING id`,
        { course_id: courseA },
        IdSchema,
      );
      questionB = await queryRow(
        `INSERT INTO questions (course_id, qid, title, uuid)
         VALUES ($course_id, 'qB', 'Question B', gen_random_uuid()) RETURNING id`,
        { course_id: courseB },
        IdSchema,
      );

      assessmentA1 = await queryRow(
        `INSERT INTO assessments (course_instance_id, tid, title, type, uuid)
         VALUES ($course_instance_id, 'hw1', 'HW 1', 'Homework', gen_random_uuid()) RETURNING id`,
        { course_instance_id: instanceA1 },
        IdSchema,
      );
      assessmentA2 = await queryRow(
        `INSERT INTO assessments (course_instance_id, tid, title, type, uuid)
         VALUES ($course_instance_id, 'hw2', 'HW 2', 'Homework', gen_random_uuid()) RETURNING id`,
        { course_instance_id: instanceA2 },
        IdSchema,
      );

      await execute(
        `INSERT INTO assessment_questions (assessment_id, question_id, allow_real_time_grading)
         VALUES ($assessment_id, $question_id, true)`,
        { assessment_id: assessmentA1, question_id: questionA },
      );

      userEnrolled = await queryRow(
        "INSERT INTO users (uid, name, uin) VALUES ('enrolled@example.com', 'Enrolled', 'A1111') RETURNING id",
        {},
        IdSchema,
      );
      userOther = await queryRow(
        "INSERT INTO users (uid, name, uin) VALUES ('other@example.com', 'Other', 'B2222') RETURNING id",
        {},
        IdSchema,
      );

      await execute(
        `INSERT INTO enrollments (user_id, course_instance_id, status, first_joined_at)
         VALUES ($user_id, $course_instance_id, 'joined', now())`,
        { user_id: userEnrolled, course_instance_id: instanceA1 },
      );
      await execute(
        `INSERT INTO enrollments (user_id, course_instance_id, status, first_joined_at)
         VALUES ($user_id, $course_instance_id, 'joined', now())`,
        { user_id: userOther, course_instance_id: instanceB },
      );

      await execute('UPDATE courses SET deleted_at = now() WHERE id = $id', { id: courseB });
    });

    it('does not leak a second course to institution administrators', async () => {
      const ids = await scopedIds(
        'questions',
        ctx({
          courseId: courseA,
          isInstitutionAdministrator: true,
        }),
      );
      expect(ids).toContain(questionA);
      expect(ids).not.toContain(questionB);
    });

    it('does not leak rows from a second course', async () => {
      const ids = await scopedIds(
        'questions',
        ctx({
          courseId: courseA,
          hasCoursePermissionPreview: true,
        }),
      );
      expect(ids).toContain(questionA);
      expect(ids).not.toContain(questionB);
    });

    it('does not leak sibling course-instance assessments', async () => {
      const ids = await scopedIds(
        'assessments',
        ctx({
          courseId: courseA,
          courseInstanceId: instanceA1,
          hasCourseInstancePermissionView: true,
        }),
      );
      expect(ids).toEqual([assessmentA1]);
      expect(ids).not.toContain(assessmentA2);
    });

    it('restricts course questions for instance-only staff', async () => {
      const ids = await scopedIds(
        'questions',
        ctx({
          courseId: courseA,
          courseInstanceId: instanceA2,
          hasCourseInstancePermissionView: true,
        }),
      );
      expect(ids).not.toContain(questionA);
    });

    it('scopes enrolled users to the authorized instance', async () => {
      const ids = await scopedIds(
        'enrolled_users',
        ctx({
          courseId: courseA,
          courseInstanceId: instanceA1,
          hasCourseInstancePermissionView: true,
        }),
      );
      expect(ids).toEqual([userEnrolled]);
    });

    it('excludes soft-deleted courses from configuration', async () => {
      await expect(
        scopedIds(
          'courses',
          ctx({
            courseId: courseB,
            hasCoursePermissionPreview: true,
          }),
        ),
      ).resolves.toEqual([]);
    });

    it('includes soft-deleted historical teams for student-data queries', async () => {
      const teamConfigId = await queryRow(
        `INSERT INTO team_configs (course_instance_id, name, minimum, maximum)
         VALUES ($course_instance_id, 'Teams', 1, 4) RETURNING id`,
        { course_instance_id: instanceA1 },
        IdSchema,
      );
      const liveTeam = await queryRow(
        `INSERT INTO teams (course_instance_id, team_config_id, name)
         VALUES ($course_instance_id, $team_config_id, 'live') RETURNING id`,
        { course_instance_id: instanceA1, team_config_id: teamConfigId },
        IdSchema,
      );
      const deletedTeam = await queryRow(
        `INSERT INTO teams (course_instance_id, team_config_id, name, deleted_at)
         VALUES ($course_instance_id, $team_config_id, 'gone', now()) RETURNING id`,
        { course_instance_id: instanceA1, team_config_id: teamConfigId },
        IdSchema,
      );

      const ids = await scopedIds(
        'teams',
        ctx({
          courseId: courseA,
          courseInstanceId: instanceA1,
          hasCourseInstancePermissionView: true,
        }),
      );
      expect(ids).toEqual(expect.arrayContaining([liveTeam, deletedTeam]));
    });

    it('does not treat nullable page_view_logs.course_instance_id as a course-wide path', async () => {
      await execute(
        `INSERT INTO page_view_logs (user_id, authn_user_id, question_id, date)
         VALUES ($user_id, $authn_user_id, $question_id, now())`,
        { user_id: userEnrolled, authn_user_id: userEnrolled, question_id: questionA },
      );
      const ids = await scopedIds(
        'page_view_logs',
        ctx({
          courseId: courseA,
          courseInstanceId: instanceA1,
          hasCourseInstancePermissionView: true,
        }),
      );
      expect(ids).toEqual([]);
    });

    it('scopes assessment_tools through either the assessment or the zone', async () => {
      const zoneId = await queryRow(
        "INSERT INTO zones (assessment_id, number, title) VALUES ($assessment_id, 1, 'Zone') RETURNING id",
        { assessment_id: assessmentA1 },
        IdSchema,
      );
      const toolOnAssessment = await queryRow(
        "INSERT INTO assessment_tools (assessment_id, tool) VALUES ($assessment_id, 'calculator') RETURNING id",
        { assessment_id: assessmentA1 },
        IdSchema,
      );
      const toolOnZone = await queryRow(
        "INSERT INTO assessment_tools (zone_id, tool) VALUES ($zone_id, 'spreadsheet') RETURNING id",
        { zone_id: zoneId },
        IdSchema,
      );

      const ids = await scopedIds(
        'assessment_tools',
        ctx({
          courseId: courseA,
          courseInstanceId: instanceA1,
          hasCourseInstancePermissionView: true,
        }),
      );
      expect(ids).toEqual(expect.arrayContaining([toolOnAssessment, toolOnZone]));
    });
  });
});
