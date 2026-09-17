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
];

function TestTable({ virtualized }: { virtualized?: boolean }) {
  const table = useTanstackTable({ data: rows, columns });
  return <TanstackTable table={table} title="Test table" virtualized={virtualized} />;
}

describe('TanstackTable', () => {
  it('renders every row when virtualization is disabled', () => {
    const markup = renderToStaticMarkup(<TestTable virtualized={false} />);

    expect(markup.match(/<tr/g)).toHaveLength(rows.length + 1);
    expect(markup).toContain('Row 25');
  });
});
