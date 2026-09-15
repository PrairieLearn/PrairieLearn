import type { CatalogForeignKey, ForeignKeyHop } from './types.js';

function columnsEqual(left: string[], right: string[]): boolean {
  if (left.length !== right.length) return false;
  return left.every((column, index) => column === right[index]);
}

export function hopMatchesForeignKey(hop: ForeignKeyHop, foreignKey: CatalogForeignKey): boolean {
  if (hop.direction === 'outgoing') {
    return (
      foreignKey.fromTable === hop.fromTable &&
      foreignKey.toTable === hop.toTable &&
      columnsEqual(foreignKey.fromColumns, hop.fromColumns) &&
      columnsEqual(foreignKey.toColumns, hop.toColumns)
    );
  }

  return (
    foreignKey.fromTable === hop.toTable &&
    foreignKey.toTable === hop.fromTable &&
    columnsEqual(foreignKey.fromColumns, hop.toColumns) &&
    columnsEqual(foreignKey.toColumns, hop.fromColumns)
  );
}

export function findMatchingForeignKey(
  hop: ForeignKeyHop,
  foreignKeys: CatalogForeignKey[],
): CatalogForeignKey | undefined {
  return foreignKeys.find((foreignKey) => hopMatchesForeignKey(hop, foreignKey));
}

export function pathHasCycle(hops: ForeignKeyHop[]): boolean {
  const seen = new Set<string>([hops[0]?.fromTable ?? '']);
  for (const hop of hops) {
    if (seen.has(hop.toTable)) return true;
    seen.add(hop.toTable);
  }
  return false;
}

export function pathTerminalTable(hops: ForeignKeyHop[]): string | null {
  if (hops.length === 0) return null;
  return hops[hops.length - 1].toTable;
}

export function outgoing(
  fromTable: string,
  fromColumn: string,
  toTable: string,
  toColumn = 'id',
): ForeignKeyHop {
  return {
    fromTable,
    fromColumns: [fromColumn],
    toTable,
    toColumns: [toColumn],
    direction: 'outgoing',
  };
}

export function incoming(
  fromTable: string,
  toTable: string,
  toColumn: string,
  fromColumn = 'id',
): ForeignKeyHop {
  return {
    fromTable,
    fromColumns: [fromColumn],
    toTable,
    toColumns: [toColumn],
    direction: 'incoming',
  };
}
