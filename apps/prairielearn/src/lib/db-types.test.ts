import _ from 'lodash';
import { afterAll, beforeAll, describe, it } from 'vitest';
import { z } from 'zod';

import { describeDatabase } from '@prairielearn/postgres-tools';

import * as helperDb from '../tests/helperDb.js';

import {
  AdministratorSchema,
  AiGradingJobSchema,
  AiQuestionGenerationPromptSchema,
  AlternativeGroupSchema,
  AssessmentAccessRuleSchema,
  AssessmentInstanceSchema,
  AssessmentModuleSchema,
  AssessmentQuestionRolePermissionsSchema,
  AssessmentQuestionSchema,
  AssessmentSchema,
  AssessmentSetSchema,
  AuditLogSchema,
  AuthnProviderSchema,
  ClientFingerprintSchema,
  CourseInstanceAccessRuleSchema,
  CourseInstancePermissionSchema,
  CourseInstanceRequiredPlanSchema,
  CourseInstanceSchema,
  CoursePermissionSchema,
  CourseRequestSchema,
  CourseSchema,
  DraftQuestionMetadataSchema,
  EnrollmentSchema,
  FileEditSchema,
  FileSchema,
  FileTransferSchema,
  GradingJobSchema,
  GroupConfigSchema,
  GroupRoleSchema,
  GroupSchema,
  GroupUserRoleSchema,
  GroupUserSchema,
  InstanceQuestionSchema,
  InstitutionAdministratorSchema,
  InstitutionSchema,
  IssueSchema,
  JobSchema,
  JobSequenceSchema,
  Lti13AssessmentsSchema,
  Lti13CourseInstanceSchema,
  Lti13InstanceSchema,
  Lti13UserSchema,
  LtiCredentialsSchema,
  NewsItemSchema,
  PlanGrantSchema,
  QueryRunSchema,
  QuestionGenerationContextEmbeddingSchema,
  QuestionSchema,
  RubricGradingItemSchema,
  RubricGradingSchema,
  RubricItemSchema,
  RubricSchema,
  SamlProviderSchema,
  SharingSetSchema,
  StripeCheckoutSessionSchema,
  SubmissionGradingContextEmbeddingSchema,
  SubmissionSchema,
  TagSchema,
  TopicSchema,
  UserSchema,
  UserSessionSchema,
  VariantSchema,
  WorkspaceHostSchema,
  WorkspaceLogSchema,
  WorkspaceSchema,
  ZoneSchema,
} from './db-types.js';

// Mapping from database table names to their corresponding Zod schemas
const TABLE_SCHEMA_MAP: Record<string, z.ZodObject<any> | null> = {
  access_logs: null,
  access_tokens: null,
  administrators: AdministratorSchema,
  ai_grading_jobs: AiGradingJobSchema,
  ai_question_generation_prompts: AiQuestionGenerationPromptSchema,
  alternative_groups: AlternativeGroupSchema,
  assessments: AssessmentSchema,
  assessment_access_rules: AssessmentAccessRuleSchema,
  assessment_instances: AssessmentInstanceSchema,
  assessment_modules: AssessmentModuleSchema,
  assessment_questions: AssessmentQuestionSchema,
  assessment_question_role_permissions: AssessmentQuestionRolePermissionsSchema,
  assessment_score_logs: null,
  assessment_sets: AssessmentSetSchema,
  assessment_state_logs: null,
  audit_logs: AuditLogSchema,
  authn_providers: AuthnProviderSchema,
  batched_migration_jobs: null,
  batched_migrations: null,
  client_fingerprints: ClientFingerprintSchema,
  chunks: null,
  courses: null,
  course_instances: CourseInstanceSchema,
  course_instance_access_rules: CourseInstanceAccessRuleSchema,
  course_instance_permissions: CourseInstancePermissionSchema,
  course_instance_required_plans: CourseInstanceRequiredPlanSchema,
  course_instance_usages: null,
  course_permissions: CoursePermissionSchema,
  course_requests: CourseRequestSchema,
  cron_jobs: null,
  current_pages: null,
  draft_question_metadata: DraftQuestionMetadataSchema,
  enrollments: EnrollmentSchema,
  exam_mode_networks: null,
  exams: null,
  feature_grants: null,
  files: FileSchema,
  file_edits: FileEditSchema,
  file_transfers: FileTransferSchema,
  grader_loads: null,
  grading_jobs: GradingJobSchema,
  groups: GroupSchema,
  group_configs: GroupConfigSchema,
  group_logs: null,
  group_roles: GroupRoleSchema,
  group_users: GroupUserSchema,
  group_user_roles: GroupUserRoleSchema,
  instance_questions: InstanceQuestionSchema,
  institutions: InstitutionSchema,
  institution_administrators: InstitutionAdministratorSchema,
  institution_authn_providers: null,
  issues: IssueSchema,
  jobs: JobSchema,
  job_sequences: JobSequenceSchema,
  last_accesses: null,
  lti13_assessments: Lti13AssessmentsSchema,
  lti13_course_instances: Lti13CourseInstanceSchema,
  lti13_instances: Lti13InstanceSchema,
  lti13_users: Lti13UserSchema,
  lti_credentials: LtiCredentialsSchema,
  lti_links: null,
  lti_outcomes: null,
  migrations: null,
  named_locks: null,
  news_items: NewsItemSchema,
  news_item_notifications: null,
  page_view_logs: null,
  pl_courses: CourseSchema,
  plan_grants: PlanGrantSchema,
  query_runs: QueryRunSchema.extend({
    // TODO: replace with a deprecated column once we use Zod 4
    sql: z.string().nullable(),
  }),
  question_generation_context_embeddings: QuestionGenerationContextEmbeddingSchema,
  questions: QuestionSchema,
  question_score_logs: null,
  question_tags: null,
  reservations: null,
  server_loads: null,
  rubrics: RubricSchema,
  rubric_gradings: RubricGradingSchema,
  rubric_grading_items: RubricGradingItemSchema,
  rubric_items: RubricItemSchema,
  saml_providers: SamlProviderSchema,
  sharing_sets: SharingSetSchema,
  sharing_set_courses: null,
  sharing_set_questions: null,
  stripe_checkout_sessions: StripeCheckoutSessionSchema,
  submission_grading_context_embeddings: SubmissionGradingContextEmbeddingSchema,
  submissions: SubmissionSchema,
  time_series: null,
  tags: TagSchema,
  topics: TopicSchema,
  users: UserSchema,
  user_sessions: UserSessionSchema,
  variants: VariantSchema,
  variant_view_logs: null,
  workspaces: WorkspaceSchema,
  workspace_hosts: WorkspaceHostSchema,
  workspace_host_logs: null,
  workspace_logs: WorkspaceLogSchema,
  zones: ZoneSchema,
};

describe('Database Schema Sync Test', () => {
  beforeAll(async () => {
    await helperDb.before();
  });

  afterAll(async () => {
    await helperDb.after();
  });

  it('Should match Zod schema keys', async () => {
    // Test each table-schema pair
    const dbName = helperDb.getDatabaseNameForCurrentWorker();
    const data = await describeDatabase(dbName);
    const tables = Object.keys(data.tables);
    const usedSchemas = new Set<string>();
    for (const tableName of tables) {
      // Skip PrairieTest tables
      if (tableName.startsWith('pt_')) {
        continue;
      }

      const schema = TABLE_SCHEMA_MAP[tableName];
      if (schema === undefined) {
        throw new Error(`No schema found for table: ${tableName}`);
      }
      // Skip tables that are not in the schema map
      if (schema === null) {
        continue;
      }

      usedSchemas.add(tableName);
      const dbColumnNames = data.tables[tableName].columns.map((column) => column.name);
      const schemaKeys = Object.keys(schema.shape);
      const extraColumns = _.difference(dbColumnNames, schemaKeys);
      const missingColumns = _.difference(schemaKeys, dbColumnNames);

      if (extraColumns.length > 0 || missingColumns.length > 0) {
        const extraColumnsDiff = extraColumns.map((column) => `+ ${column}`).join('\n');
        const missingColumnsDiff = missingColumns.map((column) => `- ${column}`).join('\n');
        // throw an error with the diff
        throw new Error(
          `Database columns for table '${tableName}' do not match Zod schema keys.\n` +
            extraColumnsDiff +
            '\n' +
            missingColumnsDiff,
        );
      }
    }

    const unusedSchemas = Object.keys(TABLE_SCHEMA_MAP).filter(
      (schemaName) => !usedSchemas.has(schemaName),
    );
    if (unusedSchemas.length > 0) {
      throw new Error(`Unused schemas: ${unusedSchemas.join(', ')}`);
    }
  });
});
