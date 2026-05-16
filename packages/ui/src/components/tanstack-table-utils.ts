interface ColumnWithOptionalChildren {
  id?: string | null;
  columns?: ColumnWithOptionalChildren[];
}

/**
 * Recursively extracts leaf column IDs from column definitions.
 * Group columns are skipped, only actual data columns are included.
 */
export function extractLeafColumnIds(columns: ColumnWithOptionalChildren[]): string[] {
  const leafIds: string[] = [];
  for (const col of columns) {
    if (col.columns && col.columns.length > 0) {
      leafIds.push(...extractLeafColumnIds(col.columns));
    } else if (col.id) {
      leafIds.push(col.id);
    }
  }
  return leafIds;
}
