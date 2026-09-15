/**
 * Reviewed data contract for course-agent queries.
 *
 * Physical PostgreSQL foreign keys may validate and expand a declared path.
 * They must not choose authorization semantics: every relation names its
 * own reviewed scope rule.
 */

export type CourseAgentDataKind =
  | 'course_configuration'
  | 'course_instance_configuration'
  | 'student_data';

export type CourseAgentAuthzRequirement =
  | 'course_permission_preview'
  | 'course_permission_view'
  | 'course_instance_permission_view'
  | 'course_preview_or_instance_view';

export type SoftDeletedRowPolicy = 'exclude' | 'include';

export type ScopeAnchor = 'course' | 'course_instance';

export type ForeignKeyDirection = 'outgoing' | 'incoming';

export interface ForeignKeyHop {
  fromTable: string;
  fromColumns: string[];
  toTable: string;
  toColumns: string[];
  direction: ForeignKeyDirection;
}

export interface NotNullConstraint {
  table: string;
  column: string;
}

/**
 * Extra reviewed predicates that foreign-key expansion cannot infer.
 * Identifiers are always taken from the manifest; never from agent input.
 */
export type CustomScopeRule =
  | {
      kind: 'not_null';
      constraints: NotNullConstraint[];
    }
  | {
      kind: 'is_null';
      constraints: NotNullConstraint[];
    }
  | {
      kind: 'question_used_in_authorized_course_instances';
    }
  | {
      kind: 'question_tag_used_in_authorized_course_instances';
    }
  | {
      kind: 'tag_used_by_authorized_questions';
    }
  | {
      kind: 'topic_used_by_authorized_questions';
    }
  | {
      kind: 'assessment_set_used_by_authorized_assessments';
    }
  | {
      kind: 'assessment_module_used_by_authorized_assessments';
    }
  | {
      kind: 'conjunction';
      rules: CustomScopeRule[];
    };

export type ScopePath =
  | {
      kind: 'single';
      hops: ForeignKeyHop[];
    }
  | {
      kind: 'disjunction';
      alternatives: ForeignKeyHop[][];
      reason: string;
    }
  | {
      kind: 'conjunction';
      paths: ForeignKeyHop[][];
      reason: string;
    };

export interface CourseAgentColumn {
  name: string;
  /** Result of `format_type(atttypid, atttypmod)` in `public`. */
  pgType: string;
  sensitive?: boolean;
}

export interface CourseAgentRelation {
  /** Logical name exposed to the DSL and tool schema. */
  name: string;
  description: string;
  dataKind: CourseAgentDataKind;
  sourceTable: string;
  columns: CourseAgentColumn[];
  authz: CourseAgentAuthzRequirement;
  scopeAnchor: ScopeAnchor;
  scopePath: ScopePath;
  customScope?: CustomScopeRule;
  softDeleted: {
    column: string | null;
    policy: SoftDeletedRowPolicy;
    reason: string;
  };
  omittedSensitiveColumns: string[];
}

export interface CourseAgentAuthzContext {
  courseId: string;
  /** Required for student data and instance-scoped configuration. */
  courseInstanceId: string | null;
  isAdministrator: boolean;
  isInstitutionAdministrator: boolean;
  hasCoursePermissionPreview: boolean;
  hasCoursePermissionView: boolean;
  hasCourseInstancePermissionView: boolean;
}

export interface CatalogColumn {
  tableName: string;
  columnName: string;
  pgType: string;
}

export interface CatalogForeignKey {
  constraintName: string;
  fromTable: string;
  fromColumns: string[];
  toTable: string;
  toColumns: string[];
}

export interface ManifestValidationFailure {
  relation?: string;
  code:
    | 'missing_table'
    | 'missing_column'
    | 'type_mismatch'
    | 'missing_foreign_key'
    | 'cycle'
    | 'unresolved_scope_path'
    | 'invalid_anchor'
    | 'duplicate_relation'
    | 'duplicate_column';
  message: string;
}
