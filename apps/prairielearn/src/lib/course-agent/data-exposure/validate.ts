import { COURSE_AGENT_RELATIONS } from './manifest.js';
import { findMatchingForeignKey, pathHasCycle, pathTerminalTable } from './paths.js';
import type {
  CatalogColumn,
  CatalogForeignKey,
  CourseAgentRelation,
  ForeignKeyHop,
  ManifestValidationFailure,
} from './types.js';

function expectedAnchorTable(relation: CourseAgentRelation): string {
  return relation.scopeAnchor === 'course' ? 'courses' : 'course_instances';
}

function validateHops({
  relation,
  hops,
  columnsByTable,
  foreignKeys,
  failures,
}: {
  relation: CourseAgentRelation;
  hops: ForeignKeyHop[];
  columnsByTable: Map<string, Map<string, string>>;
  foreignKeys: CatalogForeignKey[];
  failures: ManifestValidationFailure[];
}): void {
  if (hops.length === 0) {
    if (relation.sourceTable !== expectedAnchorTable(relation)) {
      failures.push({
        relation: relation.name,
        code: 'unresolved_scope_path',
        message: `Relation ${relation.name} has an empty scope path but source ${relation.sourceTable} is not ${expectedAnchorTable(relation)}`,
      });
    }
    return;
  }

  if (hops[0].fromTable !== relation.sourceTable) {
    failures.push({
      relation: relation.name,
      code: 'unresolved_scope_path',
      message: `Scope path for ${relation.name} must start at ${relation.sourceTable}`,
    });
  }

  for (let index = 1; index < hops.length; index++) {
    if (hops[index].fromTable !== hops[index - 1].toTable) {
      failures.push({
        relation: relation.name,
        code: 'unresolved_scope_path',
        message: `Scope path for ${relation.name} is disconnected at ${hops[index - 1].toTable} -> ${hops[index].fromTable}`,
      });
    }
  }

  if (pathHasCycle(hops)) {
    failures.push({
      relation: relation.name,
      code: 'cycle',
      message: `Scope path for ${relation.name} contains a cycle`,
    });
  }

  for (const hop of hops) {
    if (!findMatchingForeignKey(hop, foreignKeys)) {
      failures.push({
        relation: relation.name,
        code: 'missing_foreign_key',
        message: `No foreign key matches ${hop.direction} ${hop.fromTable}(${hop.fromColumns.join(',')}) -> ${hop.toTable}(${hop.toColumns.join(',')})`,
      });
    }

    const fromColumns = columnsByTable.get(hop.fromTable);
    const toColumns = columnsByTable.get(hop.toTable);
    if (!fromColumns) {
      failures.push({
        relation: relation.name,
        code: 'missing_table',
        message: `Scope hop references missing table ${hop.fromTable}`,
      });
    } else {
      for (const column of hop.fromColumns) {
        if (!fromColumns.has(column)) {
          failures.push({
            relation: relation.name,
            code: 'missing_column',
            message: `Scope hop references missing column ${hop.fromTable}.${column}`,
          });
        }
      }
    }
    if (!toColumns) {
      failures.push({
        relation: relation.name,
        code: 'missing_table',
        message: `Scope hop references missing table ${hop.toTable}`,
      });
    } else {
      for (const column of hop.toColumns) {
        if (!toColumns.has(column)) {
          failures.push({
            relation: relation.name,
            code: 'missing_column',
            message: `Scope hop references missing column ${hop.toTable}.${column}`,
          });
        }
      }
    }
  }

  const terminal = pathTerminalTable(hops);
  if (terminal !== expectedAnchorTable(relation)) {
    failures.push({
      relation: relation.name,
      code: 'invalid_anchor',
      message: `Scope path for ${relation.name} ends at ${terminal ?? 'unknown'} rather than ${expectedAnchorTable(relation)}`,
    });
  }
}

export function validateCourseAgentManifest({
  relations = COURSE_AGENT_RELATIONS,
  columns,
  foreignKeys,
}: {
  relations?: readonly CourseAgentRelation[];
  columns: CatalogColumn[];
  foreignKeys: CatalogForeignKey[];
}): ManifestValidationFailure[] {
  const failures: ManifestValidationFailure[] = [];
  const columnsByTable = new Map<string, Map<string, string>>();
  for (const column of columns) {
    let table = columnsByTable.get(column.tableName);
    if (!table) {
      table = new Map();
      columnsByTable.set(column.tableName, table);
    }
    table.set(column.columnName, column.pgType);
  }

  const seenNames = new Set<string>();
  for (const relation of relations) {
    if (seenNames.has(relation.name)) {
      failures.push({
        relation: relation.name,
        code: 'duplicate_relation',
        message: `Duplicate logical relation ${relation.name}`,
      });
    }
    seenNames.add(relation.name);

    const table = columnsByTable.get(relation.sourceTable);
    if (!table) {
      failures.push({
        relation: relation.name,
        code: 'missing_table',
        message: `Source table ${relation.sourceTable} does not exist`,
      });
      continue;
    }

    const seenColumns = new Set<string>();
    for (const column of relation.columns) {
      if (seenColumns.has(column.name)) {
        failures.push({
          relation: relation.name,
          code: 'duplicate_column',
          message: `Duplicate column ${column.name} on ${relation.name}`,
        });
      }
      seenColumns.add(column.name);

      const actualType = table.get(column.name);
      if (actualType == null) {
        failures.push({
          relation: relation.name,
          code: 'missing_column',
          message: `Column ${relation.sourceTable}.${column.name} is not in the database`,
        });
      } else if (actualType !== column.pgType) {
        failures.push({
          relation: relation.name,
          code: 'type_mismatch',
          message: `Column ${relation.sourceTable}.${column.name} has type ${actualType}, manifest declares ${column.pgType}`,
        });
      }
    }

    if (relation.softDeleted.column) {
      if (!table.has(relation.softDeleted.column)) {
        failures.push({
          relation: relation.name,
          code: 'missing_column',
          message: `Soft-delete column ${relation.sourceTable}.${relation.softDeleted.column} does not exist`,
        });
      }
    }

    for (const omitted of relation.omittedSensitiveColumns) {
      if (!table.has(omitted)) {
        failures.push({
          relation: relation.name,
          code: 'missing_column',
          message: `Omitted column ${relation.sourceTable}.${omitted} does not exist`,
        });
      }
      if (seenColumns.has(omitted)) {
        failures.push({
          relation: relation.name,
          code: 'duplicate_column',
          message: `Column ${omitted} cannot be both allowlisted and omitted on ${relation.name}`,
        });
      }
    }

    if (relation.scopePath.kind === 'single') {
      validateHops({
        relation,
        hops: relation.scopePath.hops,
        columnsByTable,
        foreignKeys,
        failures,
      });
    } else if (relation.scopePath.kind === 'disjunction') {
      for (const hops of relation.scopePath.alternatives) {
        validateHops({
          relation,
          hops,
          columnsByTable,
          foreignKeys,
          failures,
        });
      }
    } else {
      for (const hops of relation.scopePath.paths) {
        validateHops({
          relation,
          hops,
          columnsByTable,
          foreignKeys,
          failures,
        });
      }
    }
  }

  return failures;
}

export function assertCourseAgentManifestValid(failures: ManifestValidationFailure[]): void {
  if (failures.length === 0) return;
  const details = failures.map((failure) => `- ${failure.message}`).join('\n');
  throw new Error(
    `Course-agent data exposure manifest does not match the database schema:\n${details}`,
  );
}
