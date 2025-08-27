import { mapSeries } from 'async';

import { config } from '../lib/config.js';
import { EnumEnrollmentStatusSchema } from '../lib/db-types.js';
import { assertNever } from '../lib/types.js';
import { insertAuditEvent } from '../models/audit-event.js';
import { selectOptionalCourseInstanceById } from '../models/course-instances.js';
import { selectOptionalCourseById } from '../models/course.js';

import { type AdministratorQueryResult, type AdministratorQuerySpecs } from './lib/util.js';

const actions = ['insert', 'update', 'delete'] as const;
const tableNames = ['users', 'assessments', 'questions', 'enrollments', 'submissions'] as const;

type TableName = (typeof tableNames)[number];
type Action = (typeof actions)[number];

export const specs: AdministratorQuerySpecs = {
  description: 'Generate audit events for testing and development.',
  enabled: config.devMode, // This query is dangerous in production environments, so it is only enabled in dev mode
  params: [
    {
      name: 'subject_user_id',
      description: 'The user ID of the subject of the audit events.',
    },
    {
      name: 'course_instance_id',
      description: 'The course instance ID for the audit events.',
    },
    {
      name: 'table_name',
      description: 'The table name being audited (e.g., "users", "assessments").',
      options: [...tableNames, 'random'],
      default: 'random',
    },
    {
      name: 'action',
      description: 'The action being audited (insert, update, or delete).',
      options: [...actions, 'random'],
      default: 'random',
    },
    {
      name: 'num_rows',
      description: 'Number of rows to generate.',
      default: '1000',
    },
  ],
  pass_locals: true,
};

const columns = [
  'id',
  'subject_user_id',
  'course_instance_id',
  'table_name',
  'action',
  'action_detail',
  'row_id',
  'date',
] as const;
type ResultRow = Record<(typeof columns)[number], string | number | null>;

const randomChoice = <T>(array: T[] | readonly T[]): T => {
  return array[Math.floor(Math.random() * array.length)];
};

const makeRowContent = (tableName: TableName): Record<string, any> => {
  const baseContent = {
    id: Math.floor(Math.random() * 1000000),
  };
  // These aren't real data, so they don't need to be valid rows
  switch (tableName) {
    case 'users':
      return {
        ...baseContent,
        name: 'John Doe',
        email: 'john.doe@example.com',
      };
    case 'assessments':
      return {
        ...baseContent,
        title: 'Assessment 1',
      };
    case 'questions':
      return {
        ...baseContent,
        title: 'Question 1',
      };
    case 'enrollments':
      return {
        ...baseContent,
        status: randomChoice(Object.values(EnumEnrollmentStatusSchema.Values)),
      };
    case 'submissions':
      return {
        ...baseContent,
        score: Math.random() * 100,
      };
    default:
      assertNever(tableName);
  }
};

export default async function ({
  subject_user_id,
  course_instance_id,
  table_name,
  action,
  locals,
  num_rows,
}: {
  subject_user_id: string;
  course_instance_id: string;
  table_name: TableName | 'random';
  action: Action | 'random';
  locals: Record<string, any>;
  num_rows: string;
}): Promise<AdministratorQueryResult> {
  const courseInstance =
    course_instance_id.length > 0
      ? await selectOptionalCourseInstanceById(course_instance_id)
      : null;
  const course = courseInstance?.course_id
    ? await selectOptionalCourseById(courseInstance.course_id)
    : null;

  // Generate 100 audit events
  const rows = await mapSeries(
    Array.from({ length: Number(num_rows) }, (_, i) => i),
    async (index: number): Promise<ResultRow> => {
      const currentAction = action === 'random' ? randomChoice(actions) : action;

      const currentTableName = table_name === 'random' ? randomChoice(tableNames) : table_name;

      let newRow = currentAction === 'delete' ? null : makeRowContent(currentTableName);
      const oldRow = currentAction === 'insert' ? null : makeRowContent(currentTableName);

      if (currentAction === 'update') {
        newRow = {
          ...newRow,
          id: oldRow?.id,
        };
      }

      const result = await insertAuditEvent({
        action: currentAction,
        action_detail: `Generated audit event ${index + 1} for testing`,
        agent_authn_user_id: locals.authn_user.user_id,
        agent_user_id: locals.authn_user.user_id,
        course_id: course?.id,
        course_instance_id,
        institution_id: course?.institution_id,
        new_row: newRow,
        old_row: oldRow,
        row_id: newRow?.id ?? oldRow?.id,
        subject_user_id,
        table_name: currentTableName,
      });

      return {
        ...result,
        date: result.date.toISOString(),
      };
    },
  );

  return { rows, columns };
}
