import type { TableName } from '../lib/db-types.js';

/**
 * These fields are required to insert an audit event for a given table. If a parameter is explicitly marked as NULL,
 * it will pass this check.
 *
 * The value will be taken from parameters, or inferred from the current row data or row ID if not provided.
 */
export const requiredTableFields = {
  course_instances: ['course_instance_id'],
  pl_courses: ['course_id'],
  users: ['subject_user_id'],
  groups: ['group_id'],
  assessment_instances: ['assessment_instance_id'],
  assessment_questions: ['assessment_question_id'],
  assessments: ['assessment_id'],
  institutions: ['institution_id'],
  enrollments: ['course_instance_id', 'subject_user_id', 'action_detail'],
} as const satisfies Partial<Record<TableName, readonly string[]>>;

/**
 * This lists all the possible table+action_detail combinations that are supported.
 */
export type SupportedTableActionCombination =
  | {
      table_name: 'course_instances';
      action_detail?: null;
    }
  | {
      table_name: 'pl_courses';
      action_detail?: null;
    }
  | {
      table_name: 'users';
      action_detail?: 'TEST_VALUE' | null;
    }
  | {
      table_name: 'groups';
      action_detail?: null;
    }
  | {
      table_name: 'assessment_instances';
      action_detail?: null;
    }
  | {
      table_name: 'assessment_questions';
      action_detail?: null;
    }
  | {
      table_name: 'assessments';
      action_detail?: null;
    }
  | {
      table_name: 'institutions';
      action_detail?: null;
    }
  | {
      table_name: 'enrollments';
      action_detail?:
        | 'implicit_joined'
        | 'explicit_joined'
        | 'invited'
        | 'invitation_accepted'
        | 'invitation_rejected'
        | 'blocked'
        | 'unblocked'
        | 'invitation_deleted'
        | null;
    };
export type SupportedActionsForTable<T extends TableName> = NonNullable<
  Exclude<Extract<SupportedTableActionCombination, { table_name: T }>['action_detail'], null>
>;
