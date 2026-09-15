import { COURSE_AGENT_RELATIONS } from './manifest.js';
import type { CourseAgentRelation } from './types.js';

export interface CourseAgentLogicalSchema {
  version: 1;
  relations: {
    name: string;
    description: string;
    dataKind: CourseAgentRelation['dataKind'];
    sourceTable: string;
    columns: string[];
    omittedSensitiveColumns: string[];
    authz: CourseAgentRelation['authz'];
    scopeAnchor: CourseAgentRelation['scopeAnchor'];
    softDeleted: CourseAgentRelation['softDeleted'];
  }[];
}

export function getCourseAgentLogicalSchema(): CourseAgentLogicalSchema {
  return {
    version: 1,
    relations: COURSE_AGENT_RELATIONS.map((relation) => ({
      name: relation.name,
      description: relation.description,
      dataKind: relation.dataKind,
      sourceTable: relation.sourceTable,
      columns: relation.columns.map((column) => column.name),
      omittedSensitiveColumns: relation.omittedSensitiveColumns,
      authz: relation.authz,
      scopeAnchor: relation.scopeAnchor,
      softDeleted: relation.softDeleted,
    })),
  };
}

export function renderCourseAgentLogicalSchemaMarkdown(): string {
  const schema = getCourseAgentLogicalSchema();
  const lines = [
    '# Course-agent logical schema',
    '',
    'This schema is generated from the reviewed data-exposure manifest. The DSL and',
    'query tools may only name these relations and columns. New physical columns are',
    'unavailable until they are added to the manifest.',
    '',
    '| Relation | Kind | Source | Authz | Scope | Columns |',
    '| --- | --- | --- | --- | --- | --- |',
  ];

  for (const relation of schema.relations) {
    lines.push(
      `| \`${relation.name}\` | ${relation.dataKind} | \`${relation.sourceTable}\` | ${relation.authz} | ${relation.scopeAnchor} | ${relation.columns.map((column) => `\`${column}\``).join(', ')} |`,
    );
  }

  return `${lines.join('\n')}\n`;
}
