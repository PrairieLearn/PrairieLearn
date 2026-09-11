import type { ColumnFiltersState, OnChangeFn } from '@tanstack/react-table';
import { type SingleParserBuilder, type UrlKeys, useQueryStates } from 'nuqs';
import { useMemo } from 'react';

/**
 * Registry entry for {@link useColumnFilters}: a parser plus the default value
 * used when the URL param is absent. `parser.eq` is used to detect the default.
 */
export interface ColumnFilterEntry<TValue> {
  parser: SingleParserBuilder<TValue>;
  defaultValue: TValue;
  /** URL search-param key. Defaults to the column id. */
  urlKey?: string;
  /** When `false`, the filter is excluded but its URL value is preserved. Defaults to `true`. */
  enabled?: boolean;
}

type Registry = Record<string, ColumnFilterEntry<any>>;

interface Result {
  columnFilters: ColumnFiltersState;
  onColumnFiltersChange: OnChangeFn<ColumnFiltersState>;
  /** `undefined` when every enabled filter is at its default. */
  onResetColumnFilters: (() => void) | undefined;
  activeColumnFilterIds: string[];
}

/** Pure derivation of the hook's result. Exported only for unit testing. */
export function buildColumnFiltersResult(
  registry: Registry,
  values: Record<string, unknown>,
  applyPatch: (patch: Record<string, unknown>) => void,
): Result {
  const enabledIds = Object.keys(registry).filter((id) => registry[id].enabled !== false);

  const columnFilters: ColumnFiltersState = enabledIds.map((id) => ({ id, value: values[id] }));

  const activeColumnFilterIds = enabledIds.filter(
    (id) => !registry[id].parser.eq(values[id], registry[id].defaultValue),
  );

  // Enabled filters missing from `overrides` are set to `null`, which nuqs
  // treats as "remove from URL" so the parser's default is read next time.
  const buildPatch = (overrides: Map<string, unknown>): Record<string, unknown> =>
    Object.fromEntries(enabledIds.map((id) => [id, overrides.has(id) ? overrides.get(id) : null]));

  return {
    columnFilters,
    activeColumnFilterIds,
    onColumnFiltersChange: (updater) => {
      const next = typeof updater === 'function' ? updater(columnFilters) : updater;
      applyPatch(buildPatch(new Map(next.map((f) => [f.id, f.value]))));
    },
    onResetColumnFilters:
      activeColumnFilterIds.length > 0 ? () => applyPatch(buildPatch(new Map())) : undefined,
  };
}

/**
 * Bridges a column-filter registry to TanStack Table's column-filter API and
 * nuqs URL state. Callers should memoize the `registry`.
 */
export function useColumnFilters(registry: Registry): Result {
  const { parsers, urlKeys } = useMemo(() => {
    const parsers: Record<string, ReturnType<SingleParserBuilder<any>['withDefault']>> = {};
    const urlKeys: Record<string, string> = {};
    for (const [id, entry] of Object.entries(registry)) {
      parsers[id] = entry.parser.withDefault(entry.defaultValue);
      if (entry.urlKey && entry.urlKey !== id) urlKeys[id] = entry.urlKey;
    }
    return { parsers, urlKeys: urlKeys as UrlKeys<typeof parsers> };
  }, [registry]);

  const [values, setValues] = useQueryStates(parsers, { urlKeys });

  return useMemo(
    () =>
      buildColumnFiltersResult(registry, values, (patch) => {
        void setValues(patch);
      }),
    [registry, values, setValues],
  );
}
