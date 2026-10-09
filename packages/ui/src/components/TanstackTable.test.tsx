import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import {
  type TanstackTableColumnDef,
  createTanstackTableColumnHelper,
  useTanstackTable,
} from '../tanstack-table.js';

import { TanstackTable } from './TanstackTable.js';

interface TestRow {
  id: number;
  name: string;
}

const rows: TestRow[] = Array.from({ length: 25 }, (_, index) => ({
  id: index,
  name: `Row ${index + 1}`,
}));

const columnHelper = createTanstackTableColumnHelper<TestRow>();
const columns: TanstackTableColumnDef<TestRow>[] = [
  columnHelper.accessor('name', {
    header: 'Name',
    cell: (info) => info.getValue(),
  }),
  ...Array.from({ length: 12 }, (_, index) =>
    columnHelper.accessor((row) => `${row.name}, center ${index + 1}`, {
      id: `center-${index + 1}`,
      header: `Center ${index + 1}`,
      cell: (info) => info.getValue(),
    }),
  ),
];

function TestTable({
  virtualized,
  columnVisibility = {},
}: {
  virtualized?: boolean;
  columnVisibility?: Record<string, boolean>;
}) {
  const table = useTanstackTable({
    data: rows,
    columns,
    initialState: {
      columnPinning: { start: ['name'], end: [] },
      columnVisibility,
    },
  });
  return <TanstackTable table={table} title="Test table" virtualized={virtualized} />;
}

describe('TanstackTable', () => {
  it('renders every row when virtualization is disabled', () => {
    const markup = renderToStaticMarkup(<TestTable virtualized={false} />);

    expect(markup.match(/<tr/g)).toHaveLength(rows.length + 1);
    expect(markup).toContain('Row 25');
  });

  it('renders pinned and all center columns when virtualization is disabled', () => {
    const markup = renderToStaticMarkup(<TestTable virtualized={false} />);

    expect(markup).toContain('>Name<');
    for (const row of rows) {
      expect(markup).toContain(`>${row.name}<`);
    }
    for (let column = 1; column <= 12; column++) {
      expect(markup).toContain(`>Center ${column}<`);
      for (const row of rows) {
        expect(markup).toContain(`>${row.name}, center ${column}<`);
      }
    }
  });

  it('omits hidden columns when virtualization is disabled', () => {
    const markup = renderToStaticMarkup(
      <TestTable virtualized={false} columnVisibility={{ 'center-6': false }} />,
    );

    expect(markup).not.toContain('Center 6');
    expect(markup).not.toContain('center 6');
    expect(markup).toContain('Row 25, center 12');
  });
});
