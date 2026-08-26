import { createHash, randomUUID } from 'node:crypto';

import { Kysely, PostgresDialect, type SelectQueryBuilder, type Transaction, sql } from 'kysely';
import pg from 'pg';

import {
  type CourseDataFieldType,
  type CourseDataFilterOperator,
  type CourseDataQuery,
  type CourseDataQueryResult,
  type CourseDataResource,
  type CourseDataResourceDescription,
} from '@prairielearn/course-agent-protocol';
import { logger } from '@prairielearn/logger';

import { config } from '../../../lib/config.js';

const INLINE_ROW_LIMIT = 50_000;
const RESULT_BYTE_LIMIT = 10 * 1024 * 1024;
const STATEMENT_TIMEOUT_MS = 15_000;

type Timestamp = Date;
type NullableTimestamp = Date | null;

interface CourseInstancesTable {
  id: string;
  uuid: string | null;
  course_id: string;
  short_name: string;
  long_name: string | null;
  publishing_start_date: NullableTimestamp;
  publishing_end_date: NullableTimestamp;
  deleted_at: NullableTimestamp;
}

interface EnrollmentsTable {
  id: string;
  course_instance_id: string;
  user_id: string | null;
  status: string;
  is_guest: boolean;
  first_joined_at: NullableTimestamp;
}

interface UsersTable {
  id: string;
  uid: string;
  name: string | null;
}

interface AssessmentsTable {
  id: string;
  uuid: string | null;
  course_instance_id: string;
  assessment_set_id: string | null;
  assessment_module_id: string | null;
  tid: string | null;
  title: string | null;
  type: string;
  number: string;
  max_points: number | null;
  deleted_at: NullableTimestamp;
}

interface AssessmentSetsTable {
  id: string;
  course_id: string;
  name: string;
}

interface AssessmentModulesTable {
  id: string;
  course_id: string;
  name: string;
}

interface AssessmentInstancesTable {
  id: string;
  assessment_id: string;
  user_id: string | null;
  team_id: string | null;
  number: number;
  open: boolean | null;
  points: number | null;
  max_points: number | null;
  score_perc: number | null;
  date: Timestamp | null;
  modified_at: Timestamp;
  closed_at: NullableTimestamp;
}

interface TeamsTable {
  id: string;
  course_instance_id: string;
  name: string;
  deleted_at: NullableTimestamp;
}

interface CourseDataDatabase {
  course_instances: CourseInstancesTable;
  enrollments: EnrollmentsTable;
  users: UsersTable;
  assessments: AssessmentsTable;
  assessment_sets: AssessmentSetsTable;
  assessment_modules: AssessmentModulesTable;
  assessment_instances: AssessmentInstancesTable;
  teams: TeamsTable;
}

type CourseDataExecutor = Kysely<CourseDataDatabase> | Transaction<CourseDataDatabase>;
type SemanticValue = string | number | boolean | Date | null;
interface SemanticDatabase {
  resource: Record<string, SemanticValue>;
}
type SemanticBuilder = SelectQueryBuilder<SemanticDatabase, 'resource', Record<never, never>>;

interface FieldDefinition {
  internalName: string;
  name: string;
  type: CourseDataFieldType;
  description: string;
  filterOperators: CourseDataFilterOperator[];
  aggregatable: boolean;
}

interface ResourceDefinition {
  resource: CourseDataResource;
  description: string;
  fields: Record<string, FieldDefinition>;
}

const STRING_OPERATORS: CourseDataFilterOperator[] = ['eq', 'ne', 'in', 'contains', 'is_null'];
const ORDERED_STRING_OPERATORS: CourseDataFilterOperator[] = [
  'eq',
  'ne',
  'lt',
  'lte',
  'gt',
  'gte',
  'in',
  'contains',
  'is_null',
];
const NUMBER_OPERATORS: CourseDataFilterOperator[] = [
  'eq',
  'ne',
  'lt',
  'lte',
  'gt',
  'gte',
  'in',
  'is_null',
];
const DATETIME_OPERATORS: CourseDataFilterOperator[] = NUMBER_OPERATORS;
const BOOLEAN_OPERATORS: CourseDataFilterOperator[] = ['eq', 'ne', 'is_null'];

function field({
  internalName,
  name,
  type,
  description,
  filterOperators,
  aggregatable = false,
}: Omit<FieldDefinition, 'aggregatable'> & { aggregatable?: boolean }): FieldDefinition {
  return { internalName, name, type, description, filterOperators, aggregatable };
}

const RESOURCE_DEFINITIONS: Record<CourseDataResource, ResourceDefinition> = {
  course_instances: {
    resource: 'course_instances',
    description: 'Non-deleted course instances belonging to the current course.',
    fields: Object.fromEntries(
      [
        field({
          internalName: 'course_instance_id',
          name: 'course_instance.id',
          type: 'string',
          description: 'PrairieLearn course-instance ID.',
          filterOperators: STRING_OPERATORS,
        }),
        field({
          internalName: 'course_instance_uuid',
          name: 'course_instance.uuid',
          type: 'string',
          description: 'Course-instance UUID from course content.',
          filterOperators: STRING_OPERATORS,
        }),
        field({
          internalName: 'short_name',
          name: 'course_instance.short_name',
          type: 'string',
          description: 'Short course-instance name.',
          filterOperators: ORDERED_STRING_OPERATORS,
        }),
        field({
          internalName: 'long_name',
          name: 'course_instance.long_name',
          type: 'string',
          description: 'Long course-instance name.',
          filterOperators: ORDERED_STRING_OPERATORS,
        }),
        field({
          internalName: 'publishing_start_date',
          name: 'course_instance.publishing_start_date',
          type: 'datetime',
          description: 'Publishing window start.',
          filterOperators: DATETIME_OPERATORS,
        }),
        field({
          internalName: 'publishing_end_date',
          name: 'course_instance.publishing_end_date',
          type: 'datetime',
          description: 'Publishing window end.',
          filterOperators: DATETIME_OPERATORS,
        }),
      ].map((definition) => [definition.name, definition]),
    ),
  },
  students: {
    resource: 'students',
    description:
      'Resolved enrollments in course instances belonging to the current course; no email or UIN.',
    fields: Object.fromEntries(
      [
        field({
          internalName: 'enrollment_id',
          name: 'enrollment.id',
          type: 'string',
          description: 'Enrollment ID.',
          filterOperators: STRING_OPERATORS,
        }),
        field({
          internalName: 'course_instance_id',
          name: 'course_instance.id',
          type: 'string',
          description: 'Course-instance ID.',
          filterOperators: STRING_OPERATORS,
        }),
        field({
          internalName: 'course_instance_short_name',
          name: 'course_instance.short_name',
          type: 'string',
          description: 'Course-instance short name.',
          filterOperators: ORDERED_STRING_OPERATORS,
        }),
        field({
          internalName: 'student_id',
          name: 'student.id',
          type: 'string',
          description: 'Stable PrairieLearn user ID.',
          filterOperators: STRING_OPERATORS,
        }),
        field({
          internalName: 'student_uid',
          name: 'student.uid',
          type: 'string',
          description: 'Institutional login identifier.',
          filterOperators: ORDERED_STRING_OPERATORS,
        }),
        field({
          internalName: 'student_name',
          name: 'student.name',
          type: 'string',
          description: 'Student display name.',
          filterOperators: ORDERED_STRING_OPERATORS,
        }),
        field({
          internalName: 'enrollment_status',
          name: 'enrollment.status',
          type: 'string',
          description: 'Enrollment status such as joined or invited.',
          filterOperators: STRING_OPERATORS,
        }),
        field({
          internalName: 'is_guest',
          name: 'enrollment.is_guest',
          type: 'boolean',
          description: 'Whether this is a guest enrollment.',
          filterOperators: BOOLEAN_OPERATORS,
        }),
        field({
          internalName: 'first_joined_at',
          name: 'enrollment.first_joined_at',
          type: 'datetime',
          description: 'When the student first joined.',
          filterOperators: DATETIME_OPERATORS,
        }),
      ].map((definition) => [definition.name, definition]),
    ),
  },
  assessments: {
    resource: 'assessments',
    description: 'Non-deleted assessments in course instances belonging to the current course.',
    fields: Object.fromEntries(
      [
        field({
          internalName: 'assessment_id',
          name: 'assessment.id',
          type: 'string',
          description: 'Assessment ID.',
          filterOperators: STRING_OPERATORS,
        }),
        field({
          internalName: 'assessment_uuid',
          name: 'assessment.uuid',
          type: 'string',
          description: 'Assessment UUID from course content.',
          filterOperators: STRING_OPERATORS,
        }),
        field({
          internalName: 'course_instance_id',
          name: 'course_instance.id',
          type: 'string',
          description: 'Course-instance ID.',
          filterOperators: STRING_OPERATORS,
        }),
        field({
          internalName: 'course_instance_short_name',
          name: 'course_instance.short_name',
          type: 'string',
          description: 'Course-instance short name.',
          filterOperators: ORDERED_STRING_OPERATORS,
        }),
        field({
          internalName: 'assessment_tid',
          name: 'assessment.tid',
          type: 'string',
          description: 'Assessment path identifier from course content.',
          filterOperators: ORDERED_STRING_OPERATORS,
        }),
        field({
          internalName: 'assessment_title',
          name: 'assessment.title',
          type: 'string',
          description: 'Assessment title.',
          filterOperators: ORDERED_STRING_OPERATORS,
        }),
        field({
          internalName: 'assessment_type',
          name: 'assessment.type',
          type: 'string',
          description: 'Assessment type.',
          filterOperators: STRING_OPERATORS,
        }),
        field({
          internalName: 'assessment_number',
          name: 'assessment.number',
          type: 'string',
          description: 'Assessment number.',
          filterOperators: ORDERED_STRING_OPERATORS,
        }),
        field({
          internalName: 'assessment_set_name',
          name: 'assessment_set.name',
          type: 'string',
          description: 'Assessment-set name.',
          filterOperators: ORDERED_STRING_OPERATORS,
        }),
        field({
          internalName: 'assessment_module_name',
          name: 'assessment_module.name',
          type: 'string',
          description: 'Assessment-module name.',
          filterOperators: ORDERED_STRING_OPERATORS,
        }),
        field({
          internalName: 'max_points',
          name: 'assessment.max_points',
          type: 'number',
          description: 'Maximum assessment points.',
          filterOperators: NUMBER_OPERATORS,
          aggregatable: true,
        }),
      ].map((definition) => [definition.name, definition]),
    ),
  },
  assessment_attempts: {
    resource: 'assessment_attempts',
    description:
      'Student and group assessment attempts in course instances belonging to the current course.',
    fields: Object.fromEntries(
      [
        field({
          internalName: 'assessment_instance_id',
          name: 'attempt.id',
          type: 'string',
          description: 'Assessment-instance ID.',
          filterOperators: STRING_OPERATORS,
        }),
        field({
          internalName: 'course_instance_id',
          name: 'course_instance.id',
          type: 'string',
          description: 'Course-instance ID.',
          filterOperators: STRING_OPERATORS,
        }),
        field({
          internalName: 'course_instance_short_name',
          name: 'course_instance.short_name',
          type: 'string',
          description: 'Course-instance short name.',
          filterOperators: ORDERED_STRING_OPERATORS,
        }),
        field({
          internalName: 'assessment_id',
          name: 'assessment.id',
          type: 'string',
          description: 'Assessment ID.',
          filterOperators: STRING_OPERATORS,
        }),
        field({
          internalName: 'assessment_tid',
          name: 'assessment.tid',
          type: 'string',
          description: 'Assessment path identifier.',
          filterOperators: ORDERED_STRING_OPERATORS,
        }),
        field({
          internalName: 'assessment_title',
          name: 'assessment.title',
          type: 'string',
          description: 'Assessment title.',
          filterOperators: ORDERED_STRING_OPERATORS,
        }),
        field({
          internalName: 'subject_kind',
          name: 'subject.kind',
          type: 'string',
          description: 'Either student or group.',
          filterOperators: STRING_OPERATORS,
        }),
        field({
          internalName: 'student_id',
          name: 'student.id',
          type: 'string',
          description: 'Student ID for individual attempts.',
          filterOperators: STRING_OPERATORS,
        }),
        field({
          internalName: 'student_uid',
          name: 'student.uid',
          type: 'string',
          description: 'Student UID for individual attempts.',
          filterOperators: ORDERED_STRING_OPERATORS,
        }),
        field({
          internalName: 'student_name',
          name: 'student.name',
          type: 'string',
          description: 'Student name for individual attempts.',
          filterOperators: ORDERED_STRING_OPERATORS,
        }),
        field({
          internalName: 'group_id',
          name: 'group.id',
          type: 'string',
          description: 'Group ID for group attempts.',
          filterOperators: STRING_OPERATORS,
        }),
        field({
          internalName: 'group_name',
          name: 'group.name',
          type: 'string',
          description: 'Group name for group attempts.',
          filterOperators: ORDERED_STRING_OPERATORS,
        }),
        field({
          internalName: 'attempt_number',
          name: 'attempt.number',
          type: 'number',
          description: 'Attempt number.',
          filterOperators: NUMBER_OPERATORS,
          aggregatable: true,
        }),
        field({
          internalName: 'attempt_open',
          name: 'attempt.open',
          type: 'boolean',
          description: 'Whether the attempt is open.',
          filterOperators: BOOLEAN_OPERATORS,
        }),
        field({
          internalName: 'points',
          name: 'attempt.points',
          type: 'number',
          description: 'Points earned.',
          filterOperators: NUMBER_OPERATORS,
          aggregatable: true,
        }),
        field({
          internalName: 'max_points',
          name: 'attempt.max_points',
          type: 'number',
          description: 'Maximum points.',
          filterOperators: NUMBER_OPERATORS,
          aggregatable: true,
        }),
        field({
          internalName: 'score_perc',
          name: 'attempt.score_perc',
          type: 'number',
          description: 'Attempt score as a percentage from 0 to 100.',
          filterOperators: NUMBER_OPERATORS,
          aggregatable: true,
        }),
        field({
          internalName: 'created_at',
          name: 'attempt.created_at',
          type: 'datetime',
          description: 'Attempt creation time.',
          filterOperators: DATETIME_OPERATORS,
        }),
        field({
          internalName: 'modified_at',
          name: 'attempt.modified_at',
          type: 'datetime',
          description: 'Attempt modification time.',
          filterOperators: DATETIME_OPERATORS,
        }),
        field({
          internalName: 'closed_at',
          name: 'attempt.closed_at',
          type: 'datetime',
          description: 'Attempt close time.',
          filterOperators: DATETIME_OPERATORS,
        }),
      ].map((definition) => [definition.name, definition]),
    ),
  },
};

let courseDataDatabase: Kysely<CourseDataDatabase> | null = null;

function getCourseDataDatabase() {
  if (courseDataDatabase) return courseDataDatabase;

  const dedicatedConfigurationValues = [
    config.courseAgentPostgresqlHost,
    config.courseAgentPostgresqlDatabase,
    config.courseAgentPostgresqlUser,
  ];
  const dedicatedConfigurationPresent = dedicatedConfigurationValues.every(
    (value) => value !== null,
  );
  if (
    !dedicatedConfigurationPresent &&
    dedicatedConfigurationValues.some((value) => value !== null)
  ) {
    throw new Error('Course-agent PostgreSQL host, database, and user must be configured together');
  }
  if (!config.devMode && !dedicatedConfigurationPresent) {
    throw new Error('Dedicated course-agent PostgreSQL reader credentials are not configured');
  }

  const pool = new pg.Pool({
    host: config.courseAgentPostgresqlHost ?? config.postgresqlHost,
    database: config.courseAgentPostgresqlDatabase ?? config.postgresqlDatabase,
    user: config.courseAgentPostgresqlUser ?? config.postgresqlUser,
    password: config.courseAgentPostgresqlPassword ?? config.postgresqlPassword ?? undefined,
    ssl: dedicatedConfigurationPresent ? config.courseAgentPostgresqlSsl : config.postgresqlSsl,
    max: Math.min(5, config.postgresqlPoolSize),
    idleTimeoutMillis: config.postgresqlIdleTimeoutMillis,
  });
  pool.on('error', (error) => logger.error('Course-agent PostgreSQL pool error', { error }));
  courseDataDatabase = new Kysely<CourseDataDatabase>({
    dialect: new PostgresDialect({ pool }),
  });
  return courseDataDatabase;
}

function asSemanticBuilder(builder: unknown): SemanticBuilder {
  return builder as SemanticBuilder;
}

function buildResourceQuery(
  db: CourseDataExecutor,
  resource: CourseDataResource,
  courseId: string,
): SemanticBuilder {
  switch (resource) {
    case 'course_instances':
      return asSemanticBuilder(
        db.selectFrom(
          db
            .selectFrom('course_instances as ci')
            .select([
              'ci.id as course_instance_id',
              'ci.uuid as course_instance_uuid',
              'ci.short_name as short_name',
              'ci.long_name as long_name',
              'ci.publishing_start_date as publishing_start_date',
              'ci.publishing_end_date as publishing_end_date',
            ])
            .where('ci.course_id', '=', courseId)
            .where('ci.deleted_at', 'is', null)
            .as('resource'),
        ),
      );
    case 'students':
      return asSemanticBuilder(
        db.selectFrom(
          db
            .selectFrom('enrollments as e')
            .innerJoin('course_instances as ci', 'ci.id', 'e.course_instance_id')
            .innerJoin('users as u', 'u.id', 'e.user_id')
            .select([
              'e.id as enrollment_id',
              'ci.id as course_instance_id',
              'ci.short_name as course_instance_short_name',
              'u.id as student_id',
              'u.uid as student_uid',
              'u.name as student_name',
              'e.status as enrollment_status',
              'e.is_guest as is_guest',
              'e.first_joined_at as first_joined_at',
            ])
            .where('ci.course_id', '=', courseId)
            .where('ci.deleted_at', 'is', null)
            .as('resource'),
        ),
      );
    case 'assessments':
      return asSemanticBuilder(
        db.selectFrom(
          db
            .selectFrom('assessments as a')
            .innerJoin('course_instances as ci', 'ci.id', 'a.course_instance_id')
            .leftJoin('assessment_sets as aset', (join) =>
              join
                .onRef('aset.id', '=', 'a.assessment_set_id')
                .onRef('aset.course_id', '=', 'ci.course_id'),
            )
            .leftJoin('assessment_modules as am', (join) =>
              join
                .onRef('am.id', '=', 'a.assessment_module_id')
                .onRef('am.course_id', '=', 'ci.course_id'),
            )
            .select([
              'a.id as assessment_id',
              'a.uuid as assessment_uuid',
              'ci.id as course_instance_id',
              'ci.short_name as course_instance_short_name',
              'a.tid as assessment_tid',
              'a.title as assessment_title',
              'a.type as assessment_type',
              'a.number as assessment_number',
              'aset.name as assessment_set_name',
              'am.name as assessment_module_name',
              'a.max_points as max_points',
            ])
            .where('ci.course_id', '=', courseId)
            .where('ci.deleted_at', 'is', null)
            .where('a.deleted_at', 'is', null)
            .as('resource'),
        ),
      );
    case 'assessment_attempts':
      return asSemanticBuilder(
        db.selectFrom(
          db
            .selectFrom('assessment_instances as ai')
            .innerJoin('assessments as a', 'a.id', 'ai.assessment_id')
            .innerJoin('course_instances as ci', 'ci.id', 'a.course_instance_id')
            .leftJoin('users as u', 'u.id', 'ai.user_id')
            .leftJoin('enrollments as e', (join) =>
              join
                .onRef('e.user_id', '=', 'ai.user_id')
                .onRef('e.course_instance_id', '=', 'ci.id'),
            )
            .leftJoin('teams as g', (join) =>
              join
                .onRef('g.id', '=', 'ai.team_id')
                .onRef('g.course_instance_id', '=', 'ci.id')
                .on('g.deleted_at', 'is', null),
            )
            .select([
              'ai.id as assessment_instance_id',
              'ci.id as course_instance_id',
              'ci.short_name as course_instance_short_name',
              'a.id as assessment_id',
              'a.tid as assessment_tid',
              'a.title as assessment_title',
              sql<string>`CASE WHEN ${sql.ref('ai.user_id')} IS NULL THEN 'group' ELSE 'student' END`.as(
                'subject_kind',
              ),
              'u.id as student_id',
              'u.uid as student_uid',
              'u.name as student_name',
              'g.id as group_id',
              'g.name as group_name',
              'ai.number as attempt_number',
              'ai.open as attempt_open',
              'ai.points as points',
              'ai.max_points as max_points',
              'ai.score_perc as score_perc',
              'ai.date as created_at',
              'ai.modified_at as modified_at',
              'ai.closed_at as closed_at',
            ])
            .where('ci.course_id', '=', courseId)
            .where('ci.deleted_at', 'is', null)
            .where('a.deleted_at', 'is', null)
            .where((eb) => eb.or([eb('ai.user_id', 'is', null), eb('e.id', 'is not', null)]))
            .as('resource'),
        ),
      );
  }
}

export class CourseDataQueryValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CourseDataQueryValidationError';
  }
}

export class CourseDataQueryLimitError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CourseDataQueryLimitError';
  }
}

function definitionFor(query: CourseDataQuery) {
  return RESOURCE_DEFINITIONS[query.resource];
}

function requireField(definition: ResourceDefinition, name: string) {
  const fields: Partial<Record<string, FieldDefinition>> = definition.fields;
  const result = fields[name];
  if (!result) {
    throw new CourseDataQueryValidationError(
      `Unknown field "${name}" for resource "${definition.resource}".`,
    );
  }
  return result;
}

function validateValue(fieldDefinition: FieldDefinition, value: unknown) {
  if (value === null) {
    throw new CourseDataQueryValidationError(
      `Use is_null instead of a null value for "${fieldDefinition.name}".`,
    );
  }
  switch (fieldDefinition.type) {
    case 'number':
      if (typeof value !== 'number' || !Number.isFinite(value)) {
        throw new CourseDataQueryValidationError(`Field "${fieldDefinition.name}" needs a number.`);
      }
      break;
    case 'boolean':
      if (typeof value !== 'boolean') {
        throw new CourseDataQueryValidationError(
          `Field "${fieldDefinition.name}" needs a boolean.`,
        );
      }
      break;
    case 'datetime':
      if (typeof value !== 'string' || Number.isNaN(Date.parse(value))) {
        throw new CourseDataQueryValidationError(
          `Field "${fieldDefinition.name}" needs an ISO date-time string.`,
        );
      }
      break;
    case 'string':
      if (typeof value !== 'string') {
        throw new CourseDataQueryValidationError(`Field "${fieldDefinition.name}" needs a string.`);
      }
      break;
  }
}

export function validateCourseDataQuery(query: CourseDataQuery) {
  const definition = definitionFor(query);
  const aggregateQuery = query.groupBy.length > 0 || query.metrics.length > 0;
  const metricAliases = new Set<string>();

  for (const name of query.select) requireField(definition, name);
  for (const name of query.groupBy) requireField(definition, name);
  if (aggregateQuery && query.select.some((name) => !query.groupBy.includes(name))) {
    throw new CourseDataQueryValidationError(
      'Every selected field in an aggregate query must also appear in groupBy.',
    );
  }

  for (const filter of query.where) {
    const fieldDefinition = requireField(definition, filter.field);
    if (!fieldDefinition.filterOperators.includes(filter.op)) {
      throw new CourseDataQueryValidationError(
        `Operator "${filter.op}" is not allowed for "${filter.field}".`,
      );
    }
    if (filter.op === 'is_null') {
      if (typeof filter.value !== 'boolean') {
        throw new CourseDataQueryValidationError('is_null requires a boolean value.');
      }
    } else if (filter.op === 'in') {
      if (!Array.isArray(filter.value) || filter.value.length === 0) {
        throw new CourseDataQueryValidationError('in requires a non-empty value array.');
      }
      for (const value of filter.value) validateValue(fieldDefinition, value);
    } else {
      if (Array.isArray(filter.value)) {
        throw new CourseDataQueryValidationError(`${filter.op} requires a scalar value.`);
      }
      validateValue(fieldDefinition, filter.value);
    }
  }

  for (const metric of query.metrics) {
    if (metricAliases.has(metric.as) || Object.hasOwn(definition.fields, metric.as)) {
      throw new CourseDataQueryValidationError(`Duplicate output name "${metric.as}".`);
    }
    metricAliases.add(metric.as);
    if (metric.op === 'count' && metric.field === undefined) continue;
    const fieldDefinition = requireField(definition, metric.field ?? '');
    if (!['count', 'count_distinct'].includes(metric.op) && !fieldDefinition.aggregatable) {
      throw new CourseDataQueryValidationError(
        `Metric "${metric.op}" is not allowed for "${fieldDefinition.name}".`,
      );
    }
  }

  for (const order of query.orderBy) {
    if (metricAliases.has(order.field)) continue;
    requireField(definition, order.field);
    if (aggregateQuery && !query.groupBy.includes(order.field)) {
      throw new CourseDataQueryValidationError(
        `Aggregate queries may order only by groupBy fields or metric aliases, not "${order.field}".`,
      );
    }
  }
}

function queryValue(fieldDefinition: FieldDefinition, value: string | number | boolean) {
  return fieldDefinition.type === 'datetime' ? new Date(String(value)) : value;
}

function filterExpression(
  definition: ResourceDefinition,
  filter: CourseDataQuery['where'][number],
) {
  const fieldDefinition = requireField(definition, filter.field);
  const reference = sql.ref(`resource.${fieldDefinition.internalName}`);
  switch (filter.op) {
    case 'eq':
      return sql<boolean>`${reference} = ${queryValue(fieldDefinition, filter.value as string | number | boolean)}`;
    case 'ne':
      return sql<boolean>`${reference} <> ${queryValue(fieldDefinition, filter.value as string | number | boolean)}`;
    case 'lt':
      return sql<boolean>`${reference} < ${queryValue(fieldDefinition, filter.value as string | number | boolean)}`;
    case 'lte':
      return sql<boolean>`${reference} <= ${queryValue(fieldDefinition, filter.value as string | number | boolean)}`;
    case 'gt':
      return sql<boolean>`${reference} > ${queryValue(fieldDefinition, filter.value as string | number | boolean)}`;
    case 'gte':
      return sql<boolean>`${reference} >= ${queryValue(fieldDefinition, filter.value as string | number | boolean)}`;
    case 'in': {
      const values = (filter.value as (string | number | boolean)[]).map((value) =>
        queryValue(fieldDefinition, value),
      );
      return sql<boolean>`${reference} IN (${sql.join(values)})`;
    }
    case 'contains':
      return sql<boolean>`position(lower(${String(filter.value)}) in lower(coalesce(${reference}::text, ''))) > 0`;
    case 'is_null':
      return filter.value
        ? sql<boolean>`${reference} IS NULL`
        : sql<boolean>`${reference} IS NOT NULL`;
  }
}

function metricExpression(
  definition: ResourceDefinition,
  metric: CourseDataQuery['metrics'][number],
) {
  const reference = metric.field
    ? sql.ref(`resource.${requireField(definition, metric.field).internalName}`)
    : null;
  switch (metric.op) {
    case 'count':
      return reference
        ? sql<number>`count(${reference})::double precision`.as(metric.as)
        : sql<number>`count(*)::double precision`.as(metric.as);
    case 'count_distinct':
      return sql<number>`count(DISTINCT ${reference})::double precision`.as(metric.as);
    case 'sum':
      return sql<number>`sum(${reference})::double precision`.as(metric.as);
    case 'min':
      return sql<number>`min(${reference})::double precision`.as(metric.as);
    case 'max':
      return sql<number>`max(${reference})::double precision`.as(metric.as);
    case 'avg':
      return sql<number>`avg(${reference})::double precision`.as(metric.as);
  }
}

function compileQuery(
  base: SemanticBuilder,
  definition: ResourceDefinition,
  query: CourseDataQuery,
) {
  const aggregateQuery = query.groupBy.length > 0 || query.metrics.length > 0;
  const selectedNames = aggregateQuery ? query.groupBy : query.select;
  const selections = [
    ...selectedNames.map((name) => {
      const fieldDefinition = requireField(definition, name);
      return sql.ref(`resource.${fieldDefinition.internalName}`).as(name);
    }),
    ...query.metrics.map((metric) => metricExpression(definition, metric)),
  ];
  let builder = base.select(selections);

  for (const filter of query.where) {
    builder = builder.where(filterExpression(definition, filter));
  }
  if (query.groupBy.length > 0) {
    builder = builder.groupBy(
      query.groupBy.map((name) =>
        sql.ref(`resource.${requireField(definition, name).internalName}`),
      ),
    );
  }
  for (const order of query.orderBy) {
    const reference = query.metrics.some((metric) => metric.as === order.field)
      ? sql.ref(order.field)
      : sql.ref(`resource.${requireField(definition, order.field).internalName}`);
    builder = builder.orderBy(reference, order.direction);
  }
  return builder.limit(Math.min(query.limit, INLINE_ROW_LIMIT) + 1);
}

function resultColumns(query: CourseDataQuery) {
  const definition = definitionFor(query);
  const aggregateQuery = query.groupBy.length > 0 || query.metrics.length > 0;
  const selectedNames = aggregateQuery ? query.groupBy : query.select;
  return [
    ...selectedNames.map((name) => ({ name, type: requireField(definition, name).type })),
    ...query.metrics.map((metric) => ({ name: metric.as, type: 'number' as const })),
  ];
}

export function listCourseDataResources(): CourseDataResourceDescription[] {
  return Object.values(RESOURCE_DEFINITIONS).map((definition) => ({
    resource: definition.resource,
    description: definition.description,
    fields: Object.values(definition.fields).map(
      ({ name, type, description, filterOperators, aggregatable }) => ({
        name,
        type,
        description,
        filterOperators,
        aggregatable,
      }),
    ),
  }));
}

export function describeCourseDataResource(resource: CourseDataResource) {
  return listCourseDataResources().find((description) => description.resource === resource)!;
}

export async function executeCourseDataQuery({
  courseId,
  conversationId,
  runId,
  sandboxId,
  query,
}: {
  courseId: string;
  conversationId: string;
  runId: string;
  sandboxId: string;
  query: CourseDataQuery;
}): Promise<CourseDataQueryResult> {
  validateCourseDataQuery(query);
  const database = getCourseDataDatabase();
  const startedAt = performance.now();
  const queryId = randomUUID();
  const queryDigest = createHash('sha256').update(JSON.stringify(query)).digest('hex');

  const unboundedRows = await database.transaction().execute(async (transaction) => {
    await sql`SET TRANSACTION READ ONLY`.execute(transaction);
    await sql`SET LOCAL statement_timeout = ${sql.raw(String(STATEMENT_TIMEOUT_MS))}`.execute(
      transaction,
    );
    const base = buildResourceQuery(transaction, query.resource, courseId);
    return await compileQuery(base, definitionFor(query), query).execute();
  });
  const truncated = unboundedRows.length > query.limit;
  const rows = unboundedRows.slice(0, query.limit) as Record<string, unknown>[];
  const resultBytes = Buffer.byteLength(JSON.stringify(rows));
  if (resultBytes > RESULT_BYTE_LIMIT) {
    throw new CourseDataQueryLimitError(
      `Query result was ${resultBytes} bytes; the limit is ${RESULT_BYTE_LIMIT} bytes.`,
    );
  }

  logger.info('Course-agent data query completed', {
    course_id: courseId,
    conversation_id: conversationId,
    run_id: runId,
    sandbox_id: sandboxId,
    query_id: queryId,
    query_digest: queryDigest,
    resource: query.resource,
    selected_fields: query.select,
    grouped_fields: query.groupBy,
    metric_names: query.metrics.map((metric) => metric.as),
    row_count: rows.length,
    result_bytes: resultBytes,
    truncated,
    duration_ms: Math.round(performance.now() - startedAt),
  });

  return {
    queryId,
    resource: query.resource,
    columns: resultColumns(query),
    rows,
    rowCount: rows.length,
    truncated,
  };
}
