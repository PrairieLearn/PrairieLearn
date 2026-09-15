import { hasCourseWideConfigurationAccess } from './authorize.js';
import type {
  CourseAgentAuthzContext,
  CourseAgentRelation,
  CustomScopeRule,
  ForeignKeyHop,
} from './types.js';

export function assertSafeIdent(name: string): string {
  if (!/^[a-z_][a-z0-9_]*$/.test(name)) {
    throw new Error(`Refusing to interpolate identifier ${name}`);
  }
  return name;
}

function qualify(alias: string, column: string): string {
  return `${assertSafeIdent(alias)}.${assertSafeIdent(column)}`;
}

function hopJoin(previousAlias: string, nextAlias: string, hop: ForeignKeyHop): string {
  const conditions = hop.fromColumns.map(
    (fromColumn, index) =>
      `${qualify(previousAlias, fromColumn)} = ${qualify(nextAlias, hop.toColumns[index])}`,
  );
  return `JOIN ${assertSafeIdent(hop.toTable)} AS ${assertSafeIdent(nextAlias)} ON ${conditions.join(' AND ')}`;
}

function existsForHops({
  sourceAlias,
  hops,
  terminalPredicate,
}: {
  sourceAlias: string;
  hops: ForeignKeyHop[];
  terminalPredicate: string;
}): string {
  if (hops.length === 0) {
    return `(${terminalPredicate.replaceAll('__terminal__', sourceAlias)})`;
  }

  const joins: string[] = [];
  let previousAlias = sourceAlias;
  hops.forEach((hop, index) => {
    const nextAlias = `p${index}`;
    joins.push(hopJoin(previousAlias, nextAlias, hop));
    previousAlias = nextAlias;
  });

  return `EXISTS (SELECT 1 ${joins.join(' ')} WHERE ${terminalPredicate.replaceAll('__terminal__', previousAlias)})`;
}

function terminalPredicate(
  relation: CourseAgentRelation,
  context: CourseAgentAuthzContext,
): string {
  const courseWide = hasCourseWideConfigurationAccess(context);
  if (relation.scopeAnchor === 'course') {
    return '__terminal__.id = $course_id';
  }

  if (courseWide && context.courseInstanceId == null && relation.dataKind !== 'student_data') {
    return '__terminal__.course_id = $course_id';
  }

  return '__terminal__.id = $course_instance_id';
}

function renderCustomRule(
  relation: CourseAgentRelation,
  rule: CustomScopeRule,
  sourceAlias: string,
  context: CourseAgentAuthzContext,
): string | null {
  const courseWide = hasCourseWideConfigurationAccess(context);
  switch (rule.kind) {
    case 'not_null':
      return rule.constraints
        .map((constraint) => {
          const alias = constraint.table === relation.sourceTable ? sourceAlias : constraint.table;
          return `${qualify(alias, constraint.column)} IS NOT NULL`;
        })
        .join(' AND ');
    case 'is_null':
      return rule.constraints
        .map((constraint) => {
          const alias = constraint.table === relation.sourceTable ? sourceAlias : constraint.table;
          return `${qualify(alias, constraint.column)} IS NULL`;
        })
        .join(' AND ');
    case 'question_used_in_authorized_course_instances':
      if (courseWide) return null;
      return `EXISTS (
        SELECT 1
        FROM assessment_questions AS aq
        JOIN assessments AS a ON a.id = aq.assessment_id
        WHERE aq.question_id = ${qualify(sourceAlias, 'id')}
          AND a.course_instance_id = $course_instance_id
          AND aq.deleted_at IS NULL
          AND a.deleted_at IS NULL
      )`;
    case 'question_tag_used_in_authorized_course_instances':
      if (courseWide) return null;
      return `EXISTS (
        SELECT 1
        FROM assessment_questions AS aq
        JOIN assessments AS a ON a.id = aq.assessment_id
        WHERE aq.question_id = ${qualify(sourceAlias, 'question_id')}
          AND a.course_instance_id = $course_instance_id
          AND aq.deleted_at IS NULL
          AND a.deleted_at IS NULL
      )`;
    case 'tag_used_by_authorized_questions':
      if (courseWide) return null;
      return `EXISTS (
        SELECT 1
        FROM question_tags AS qt
        JOIN assessment_questions AS aq ON aq.question_id = qt.question_id
        JOIN assessments AS a ON a.id = aq.assessment_id
        WHERE qt.tag_id = ${qualify(sourceAlias, 'id')}
          AND a.course_instance_id = $course_instance_id
          AND aq.deleted_at IS NULL
          AND a.deleted_at IS NULL
      )`;
    case 'topic_used_by_authorized_questions':
      if (courseWide) return null;
      return `EXISTS (
        SELECT 1
        FROM questions AS q
        JOIN assessment_questions AS aq ON aq.question_id = q.id
        JOIN assessments AS a ON a.id = aq.assessment_id
        WHERE q.topic_id = ${qualify(sourceAlias, 'id')}
          AND a.course_instance_id = $course_instance_id
          AND q.deleted_at IS NULL
          AND aq.deleted_at IS NULL
          AND a.deleted_at IS NULL
      )`;
    case 'assessment_set_used_by_authorized_assessments':
      if (courseWide) return null;
      return `EXISTS (
        SELECT 1
        FROM assessments AS a
        WHERE a.assessment_set_id = ${qualify(sourceAlias, 'id')}
          AND a.course_instance_id = $course_instance_id
          AND a.deleted_at IS NULL
      )`;
    case 'assessment_module_used_by_authorized_assessments':
      if (courseWide) return null;
      return `EXISTS (
        SELECT 1
        FROM assessments AS a
        WHERE a.assessment_module_id = ${qualify(sourceAlias, 'id')}
          AND a.course_instance_id = $course_instance_id
          AND a.deleted_at IS NULL
      )`;
    case 'conjunction':
      return rule.rules
        .map((inner) => renderCustomRule(relation, inner, sourceAlias, context))
        .filter((part): part is string => part != null)
        .map((part) => `(${part})`)
        .join(' AND ');
  }
}

function renderSoftDelete(relation: CourseAgentRelation, sourceAlias: string): string | null {
  if (!relation.softDeleted.column || relation.softDeleted.policy !== 'exclude') {
    return null;
  }
  return `${qualify(sourceAlias, relation.softDeleted.column)} IS NULL`;
}

/**
 * Trusted WHERE predicate for one relation. Placeholders are `$course_id` and
 * `$course_instance_id`; callers bind values from the authorized context.
 */
export function buildRelationScopePredicate({
  relation,
  context,
  sourceAlias = 'src',
}: {
  relation: CourseAgentRelation;
  context: CourseAgentAuthzContext;
  sourceAlias?: string;
}): string {
  const parts: string[] = [];
  const terminal = terminalPredicate(relation, context);

  if (relation.scopePath.kind === 'single') {
    parts.push(
      existsForHops({
        sourceAlias,
        hops: relation.scopePath.hops,
        terminalPredicate: terminal,
      }),
    );
  } else if (relation.scopePath.kind === 'disjunction') {
    const alternatives = relation.scopePath.alternatives.map((hops) =>
      existsForHops({ sourceAlias, hops, terminalPredicate: terminal }),
    );
    parts.push(`(${alternatives.join(' OR ')})`);
  } else {
    const paths = relation.scopePath.paths.map((hops) =>
      existsForHops({ sourceAlias, hops, terminalPredicate: terminal }),
    );
    parts.push(`(${paths.join(' AND ')})`);
  }

  if (relation.customScope) {
    const custom = renderCustomRule(relation, relation.customScope, sourceAlias, context);
    if (custom) parts.push(`(${custom})`);
  }

  const softDelete = renderSoftDelete(relation, sourceAlias);
  if (softDelete) parts.push(softDelete);

  return parts.join(' AND ');
}

export function bindScopeParams(
  sqlText: string,
  context: CourseAgentAuthzContext,
): {
  text: string;
  values: string[];
} {
  const values: string[] = [];
  let text = sqlText;
  if (text.includes('$course_id')) {
    values.push(context.courseId);
    text = text.replaceAll('$course_id', `$${values.length}`);
  }
  if (text.includes('$course_instance_id')) {
    if (context.courseInstanceId == null) {
      throw new Error('Scope predicate requires a course instance id');
    }
    values.push(context.courseInstanceId);
    text = text.replaceAll('$course_instance_id', `$${values.length}`);
  }
  return { text, values };
}
