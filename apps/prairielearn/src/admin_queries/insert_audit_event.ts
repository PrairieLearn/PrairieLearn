import { mapSeries } from 'async';
import { z } from 'zod';

import { loadSqlEquiv, queryRows } from '@prairielearn/postgres';

import { type AdministratorQueryResult, type AdministratorQuerySpecs } from './lib/util.js';

export const specs: AdministratorQuerySpecs = {
  description:
    'Generate 100 audit events with sensible default values for testing and development.',
  params: [
    {
      name: 'subject_user_id',
      description:
        'The user ID of the subject of the audit events (will be used for all 100 rows).',
    },
    {
      name: 'course_instance_id',
      description: 'The course instance ID for the audit events (will be used for all 100 rows).',
    },
    {
      name: 'table_name',
      description: 'The table name being audited (e.g., "users", "assessments").',
      default: 'users',
    },
    {
      name: 'action',
      description: 'The action being audited (insert, update, or delete).',
      default: 'insert',
    },
    {
      name: 'base_row_id',
      description: 'Base row ID to start from (will increment for each row).',
      default: '1000',
    },
  ],
};

const sql = loadSqlEquiv(import.meta.url);

const columns = [
  'id',
  'subject_user_id',
  'course_instance_id',
  'table_name',
  'action',
  'action_detail',
  'row_id',
  'agent_user_id',
  'agent_authn_user_id',
  'date',
] as const;
type ResultRow = Record<(typeof columns)[number], string | number | null>;

const AuditEventSchema = z.object({
  id: z.string(),
  subject_user_id: z.string(),
  course_instance_id: z.string(),
  table_name: z.string(),
  action: z.string(),
  action_detail: z.string().nullable(),
  row_id: z.string(),
  agent_user_id: z.string().nullable(),
  agent_authn_user_id: z.string().nullable(),
  date: z.string(),
});

export default async function ({
  subject_user_id,
  course_instance_id,
  table_name,
  action,
  base_row_id,
}: {
  subject_user_id: string;
  course_instance_id: string;
  table_name: string;
  action: string;
  base_row_id: string;
}): Promise<AdministratorQueryResult> {
  const baseRowId = Number.parseInt(base_row_id);
  const actions = ['insert', 'update', 'delete'] as const;
  const tableNames = ['users', 'assessments', 'questions', 'enrollments', 'submissions'] as const;

  // Generate 100 audit events
  const rows = await mapSeries(
    Array.from({ length: 100 }, (_, i) => i),
    async (index: number): Promise<ResultRow> => {
      const currentAction =
        action === 'random' ? actions[Math.floor(Math.random() * actions.length)] : action;

      const currentTableName =
        table_name === 'random'
          ? tableNames[Math.floor(Math.random() * tableNames.length)]
          : table_name;

      const result = await queryRows(
        sql.insert_audit_event,
        {
          subject_user_id,
          course_instance_id,
          table_name: currentTableName,
          action: currentAction,
          action_detail: `Generated audit event ${index + 1} for testing`,
          row_id: (baseRowId + index).toString(),
          agent_user_id: subject_user_id, // Use same user as agent for simplicity
          agent_authn_user_id: subject_user_id,
        },
        AuditEventSchema,
      );

      return result[0];
    },
  );

  return { rows, columns };
}
