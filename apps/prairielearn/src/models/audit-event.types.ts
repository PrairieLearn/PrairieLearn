import type { TableName } from '../lib/db-types.js';

/**
 * These fields are required to insert an audit event for a given table. If a parameter is explicitly marked as NULL,
 * it will pass this check.
 *
 * The value will be taken from parameters, or inferred from the current row data or row ID if not provided.
 */
export const requiredTableFields = {
  course_instances: ['course_instance_id'],
  courses: ['course_id'],
  users: ['subject_user_id'],
  teams: ['team_id'],
  assessment_instances: ['assessment_instance_id'],
  assessment_questions: ['assessment_question_id'],
  assessments: ['assessment_id'],
  institutions: ['institution_id'],
  enrollments: ['course_instance_id', 'subject_user_id', 'action_detail'],
  student_label_enrollments: ['enrollment_id', 'action_detail'],
} as const satisfies Partial<Record<TableName, readonly string[]>>;

/**
 * This lists all the possible table+action_detail combinations that are supported.
 */
export type SupportedTableActionCombination =
  | {
      tableName: 'course_instances';
      actionDetail?: null;
    }
  | {
      tableName: 'courses';
      actionDetail?: null;
    }
  | {
      tableName: 'users';
      actionDetail?: null;
    }
  | {
      tableName: 'teams';
      actionDetail?: null;
    }
  | {
      tableName: 'assessment_instances';
      actionDetail?: null;
    }
  | {
      tableName: 'assessment_questions';
      actionDetail?: null;
    }
  | {
      tableName: 'assessments';
      actionDetail?: null;
    }
  | {
      tableName: 'institutions';
      actionDetail?: null;
    }
  | {
      tableName: 'enrollments';
      actionDetail?:
        | 'implicit_joined'
        // NOTE: while we no longer write `explicit_joined` events, they exist
        // in production, so we must keep supporting them here. We could consider
        // migrating them to another type in the future.
        | 'explicit_joined'
        | 'invited'
        | 'invited_by_manual_sync'
        | 'invitation_accepted'
        | 'invitation_rejected'
        | 'blocked'
        | 'unblocked'
        | 'unblocked_by_manual_sync'
        | 'invitation_deleted'
        | 'invitation_deleted_by_manual_sync'
        | 'left'
        | 'removed'
        | 'removed_by_manual_sync'
        | 'reenrolled_by_manual_sync'
        | 'reenrolled_by_instructor'
        | null;
    }
  | {
      tableName: 'student_label_enrollments';
      actionDetail?: 'enrollment_added' | 'enrollment_removed' | null;
    };
export type SupportedActionsForTable<T extends TableName> = NonNullable<
  Exclude<Extract<SupportedTableActionCombination, { tableName: T }>['actionDetail'], null>
>;
