import _ from 'lodash';
import { afterAll, beforeAll, describe, it } from 'vitest';
import { type z } from 'zod';

import { describeDatabase } from '@prairielearn/postgres-tools';

import * as helperDb from '../tests/helperDb.js';

import {
  AccessLogSchema,
  AccessTokenSchema,
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
  AssessmentScoreLogSchema,
  AssessmentSetSchema,
  AssessmentStateLogSchema,
  AuditLogSchema,
  AuthnProviderSchema,
  BatchedMigrationJobSchema,
  BatchedMigrationSchema,
  ChunkSchema,
  ClientFingerprintSchema,
  CourseInstanceAccessRuleSchema,
  CourseInstancePermissionSchema,
  CourseInstanceRequiredPlanSchema,
  CourseInstanceSchema,
  CourseInstanceUsageSchema,
  CoursePermissionSchema,
  CourseRequestSchema,
  CourseSchema,
  CronJobSchema,
  CurrentPageSchema,
  DraftQuestionMetadataSchema,
  EnrollmentSchema,
  ExamModeNetworkSchema,
  ExamSchema,
  FeatureGrantSchema,
  FileEditSchema,
  FileSchema,
  FileTransferSchema,
  GlueCourseSchema,
  GraderLoadSchema,
  GradingJobSchema,
  GroupConfigSchema,
  GroupLogSchema,
  GroupRoleSchema,
  GroupSchema,
  GroupUserRoleSchema,
  GroupUserSchema,
  InstanceQuestionSchema,
  InstitutionAdministratorSchema,
  InstitutionAuthnProviderSchema,
  InstitutionSchema,
  IssueSchema,
  JobSchema,
  JobSequenceSchema,
  LastAccessSchema,
  Lti13AssessmentsSchema,
  Lti13CourseInstanceSchema,
  Lti13InstanceSchema,
  Lti13UserSchema,
  LtiCredentialsSchema,
  LtiLinkSchema,
  LtiOutcomeSchema,
  MigrationSchema,
  NamedLockSchema,
  NewsItemNotificationSchema,
  NewsItemSchema,
  PageViewLogSchema,
  PlanGrantSchema,
  QueryRunSchema,
  QuestionGenerationContextEmbeddingSchema,
  QuestionSchema,
  QuestionScoreLogSchema,
  QuestionTagSchema,
  ReservationSchema,
  RubricGradingItemSchema,
  RubricGradingSchema,
  RubricItemSchema,
  RubricSchema,
  SamlProviderSchema,
  ServerLoadSchema,
  SharingSetCourseSchema,
  SharingSetQuestionSchema,
  SharingSetSchema,
  StripeCheckoutSessionSchema,
  SubmissionGradingContextEmbeddingSchema,
  SubmissionSchema,
  TagSchema,
  TimeSeriesSchema,
  TopicSchema,
  UserSchema,
  UserSessionSchema,
  VariantSchema,
  VariantViewLogSchema,
  WorkspaceHostLogSchema,
  WorkspaceHostSchema,
  WorkspaceLogSchema,
  WorkspaceSchema,
  ZoneSchema,
} from './db-types.js';

// Mapping from database table names to their corresponding Zod schemas
const TABLE_SCHEMA_MAP: Record<string, z.ZodObject<any>> = {
  access_logs: AccessLogSchema,
  access_tokens: AccessTokenSchema,
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
  assessment_score_logs: AssessmentScoreLogSchema,
  assessment_sets: AssessmentSetSchema,
  assessment_state_logs: AssessmentStateLogSchema,
  audit_logs: AuditLogSchema,
  authn_providers: AuthnProviderSchema,
  batched_migration_jobs: BatchedMigrationJobSchema,
  batched_migrations: BatchedMigrationSchema,
  client_fingerprints: ClientFingerprintSchema,
  chunks: ChunkSchema,
  courses: GlueCourseSchema,
  course_instances: CourseInstanceSchema,
  course_instance_access_rules: CourseInstanceAccessRuleSchema,
  course_instance_permissions: CourseInstancePermissionSchema,
  course_instance_required_plans: CourseInstanceRequiredPlanSchema,
  course_instance_usages: CourseInstanceUsageSchema,
  course_permissions: CoursePermissionSchema,
  course_requests: CourseRequestSchema,
  cron_jobs: CronJobSchema,
  current_pages: CurrentPageSchema,
  draft_question_metadata: DraftQuestionMetadataSchema,
  enrollments: EnrollmentSchema,
  exam_mode_networks: ExamModeNetworkSchema,
  exams: ExamSchema,
  feature_grants: FeatureGrantSchema,
  files: FileSchema,
  file_edits: FileEditSchema,
  file_transfers: FileTransferSchema,
  grader_loads: GraderLoadSchema,
  grading_jobs: GradingJobSchema,
  groups: GroupSchema,
  group_configs: GroupConfigSchema,
  group_logs: GroupLogSchema,
  group_roles: GroupRoleSchema,
  group_users: GroupUserSchema,
  group_user_roles: GroupUserRoleSchema,
  instance_questions: InstanceQuestionSchema,
  institutions: InstitutionSchema,
  institution_administrators: InstitutionAdministratorSchema,
  institution_authn_providers: InstitutionAuthnProviderSchema,
  issues: IssueSchema,
  jobs: JobSchema,
  job_sequences: JobSequenceSchema,
  last_accesses: LastAccessSchema,
  lti13_assessments: Lti13AssessmentsSchema,
  lti13_course_instances: Lti13CourseInstanceSchema,
  lti13_instances: Lti13InstanceSchema,
  lti13_users: Lti13UserSchema,
  lti_credentials: LtiCredentialsSchema,
  lti_links: LtiLinkSchema,
  lti_outcomes: LtiOutcomeSchema,
  migrations: MigrationSchema,
  named_locks: NamedLockSchema,
  news_items: NewsItemSchema,
  news_item_notifications: NewsItemNotificationSchema,
  page_view_logs: PageViewLogSchema,
  pl_courses: CourseSchema,
  plan_grants: PlanGrantSchema,
  query_runs: QueryRunSchema,
  question_generation_context_embeddings: QuestionGenerationContextEmbeddingSchema,
  questions: QuestionSchema,
  question_score_logs: QuestionScoreLogSchema,
  question_tags: QuestionTagSchema,
  reservations: ReservationSchema,
  server_loads: ServerLoadSchema,
  rubrics: RubricSchema,
  rubric_gradings: RubricGradingSchema,
  rubric_grading_items: RubricGradingItemSchema,
  rubric_items: RubricItemSchema,
  saml_providers: SamlProviderSchema,
  sharing_sets: SharingSetSchema,
  sharing_set_courses: SharingSetCourseSchema,
  sharing_set_questions: SharingSetQuestionSchema,
  stripe_checkout_sessions: StripeCheckoutSessionSchema,
  submission_grading_context_embeddings: SubmissionGradingContextEmbeddingSchema,
  submissions: SubmissionSchema,
  time_series: TimeSeriesSchema,
  tags: TagSchema,
  topics: TopicSchema,
  users: UserSchema,
  user_sessions: UserSessionSchema,
  variants: VariantSchema,
  variant_view_logs: VariantViewLogSchema,
  workspaces: WorkspaceSchema,
  workspace_hosts: WorkspaceHostSchema,
  workspace_host_logs: WorkspaceHostLogSchema,
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
      if (!schema) {
        throw new Error(`No schema found for table: ${tableName}`);
      }
      usedSchemas.add(tableName);
      const dbColumnNames = data.tables[tableName].columns.map((column) => column.name);
      const schemaKeys = Object.keys(schema.shape);
      const extraColumns = _.difference(dbColumnNames, schemaKeys);
      const missingColumns = _.difference(schemaKeys, dbColumnNames);

      if (extraColumns.length > 0 || missingColumns.length > 0) {
        continue;
        // TODO: enable this
        // const extraColumnsDiff = extraColumns.map((column) => `+ ${column}`).join('\n');
        // const missingColumnsDiff = missingColumns.map((column) => `- ${column}`).join('\n');
        // // throw an error with the diff
        // throw new Error(
        //   `Database columns for table '${tableName}' do not match Zod schema keys.\n` +
        //     extraColumnsDiff +
        //     '\n' +
        //     missingColumnsDiff,
        // );
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
