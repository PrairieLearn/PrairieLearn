import {
  type ColumnDef,
  type ColumnFiltersState,
  type SortDirection,
  type SortingState,
  type Table,
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getSortedRowModel,
  useReactTable,
} from '@tanstack/react-table';
import { createContext, forwardRef, useContext, useEffect, useMemo, useState } from 'preact/compat';
import { FixedSizeList as List } from 'react-window';

import type { StudentRow } from '../instructorStudents.types.js';

export interface InstructorStudentsData {
  urlPrefix: string;
  csvFilename: string;
  csrfToken: string;
  hasCourseInstancePermissionEdit: boolean;
  students: StudentRow[];
}

interface StudentsTableProps {
  students: StudentRow[];
}

function SortIcon({ isSorted }: { isSorted: false | SortDirection }) {
  if (isSorted === 'asc') {
    return <i className="bi bi-sort-up"></i>;
  } else if (isSorted === 'desc') {
    return <i className="bi bi-sort-down"></i>;
  } else {
    return <i className="bi bi-arrows-expand text-muted"></i>;
  }
}

// StickyListContext and helpers for sticky header row
const StickyListContext = createContext<any>(null);
StickyListContext.displayName = 'StickyListContext';

const ItemWrapper = ({ data, index, style }: any) => {
  const { ItemRenderer, stickyIndices } = data;
  if (stickyIndices && stickyIndices.includes(index)) {
    return null;
  }
  return <ItemRenderer index={index} style={style} />;
};

function StickyHeaderRow({
  style,
  table,
  rowHeight,
}: {
  style: any;
  table: Table<StudentRow>;
  rowHeight: number;
}) {
  const headers = table.getHeaderGroups()[0].headers;
  const gridTemplateColumns = headers
    .map((header, i) =>
      i === headers.length - 1
        ? `minmax(${header.column.columnDef.minSize}px, 1fr)`
        : `${header.getSize()}px`,
    )
    .join(' ');
  return (
    <div
      className="d-grid bg-light fw-bold"
      style={{
        ...style,
        gridTemplateColumns,
        position: 'sticky',
        top: 0,
        zIndex: 2,
        height: rowHeight,
        background: 'white',
      }}
      role="row"
    >
      {headers.map((header, i) => (
        <div
          key={header.id}
          className={`text-nowrap px-2 py-2 position-relative bg-light border-bottom ${i !== headers.length - 1 ? 'border-end' : ''}`}
          style={{
            cursor: header.column.getCanSort() ? 'pointer' : 'default',
            userSelect: 'none',
            width:
              i === headers.length - 1
                ? '1fr'
                : header.getSize
                  ? `${header.getSize()}px`
                  : undefined,
          }}
          onClick={header.column.getToggleSortingHandler()}
          role="columnheader"
        >
          {header.isPlaceholder
            ? null
            : flexRender(header.column.columnDef.header, header.getContext())}
          {header.column.getCanSort() && (
            <span className="ms-1">
              <SortIcon isSorted={header.column.getIsSorted()} />
            </span>
          )}
          {i < headers.length - 1 && header.column.getCanResize() && (
            <div
              style={{
                position: 'absolute',
                right: -4,
                top: 0,
                width: 8,
                height: '100%',
                cursor: 'col-resize',
                zIndex: 2,
                userSelect: 'none',
              }}
              onMouseDown={header.getResizeHandler()}
              onTouchStart={header.getResizeHandler()}
              onClick={(e) => e.stopPropagation()}
            />
          )}
        </div>
      ))}
    </div>
  );
}

const innerElementType = forwardRef(({ children, ...rest }: any, ref) => {
  const { stickyIndices, headerStyle, table, rowHeight } = useContext(StickyListContext);
  return (
    <div ref={ref} {...rest}>
      {stickyIndices.map((index: number) => (
        <StickyHeaderRow key={index} style={headerStyle} table={table} rowHeight={rowHeight} />
      ))}
      {children}
    </div>
  );
});

// I don't quite understand this code, TODO: comment this
const StickyList = ({ children, stickyIndices, headerStyle, table, rowHeight, ...rest }: any) => (
  <StickyListContext.Provider
    // eslint-disable-next-line @eslint-react/no-unstable-context-value
    value={{ ItemRenderer: children, stickyIndices, headerStyle, table, rowHeight }}
  >
    <List
      itemData={{ ItemRenderer: children, stickyIndices }}
      innerElementType={innerElementType}
      {...rest}
    >
      {ItemWrapper}
    </List>
  </StickyListContext.Provider>
);

interface VirtualizedRowProps {
  index: number;
  style: any;
  table: Table<StudentRow>;
  height: number;
}

function VirtualizedRow({ index, style, table, height }: VirtualizedRowProps) {
  if (index === 0) return null; // header is rendered by StickyHeaderRow
  const row = table.getRowModel().rows[index - 1];
  const headers = table.getHeaderGroups()[0].headers;
  const gridTemplateColumns = headers
    .map((header, i) =>
      i === headers.length - 1
        ? `minmax(${header.column.columnDef.minSize}px, 1fr)`
        : `${header.getSize()}px`,
    )
    .join(' ');
  return (
    <div
      className="d-grid align-items-center"
      style={{ ...style, gridTemplateColumns, height }}
      role="row"
      key={row.id}
    >
      {row.getVisibleCells().map((cell: any, i: number) => (
        <div
          className={`px-2 py-2 overflow-auto text-nowrap h-100 d-flex align-items-center flex-row border-bottom ${
            i !== headers.length - 1 ? 'border-end' : ''
          }`}
          role="cell"
          key={cell.id}
        >
          {flexRender(cell.column.columnDef.cell, cell.getContext())}
        </div>
      ))}
    </div>
  );
}

export function StudentsTable({ students }: StudentsTableProps) {
  const [sorting, setSorting] = useState<SortingState>([]);
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
  const [globalFilter, setGlobalFilter] = useState('');

  const columns = useMemo<ColumnDef<StudentRow, any>[]>(
    () => [
      {
        accessorKey: 'uid',
        header: 'UID',
        enableSorting: true,
        size: 300,
        minSize: 150,
        maxSize: 600,
      },
      {
        accessorKey: 'name',
        header: 'Name',
        enableSorting: true,
        size: 300,
        minSize: 150,
        maxSize: 600,
      },
      {
        accessorKey: 'email',
        header: 'Email',
        enableSorting: true,
        size: 300,
        minSize: 150,
        maxSize: 600,
      },
      {
        accessorKey: 'created_at',
        header: 'Enrolled At',
        enableSorting: true,
        size: 200, // uses a fraction of the available space
        minSize: 150,
        maxSize: 600,
        enableResizing: false,
      },
    ],
    [],
  );

  const table = useReactTable({
    data: students,
    columns,
    state: {
      sorting,
      columnFilters,
      globalFilter,
    },
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    onGlobalFilterChange: setGlobalFilter,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    enableColumnResizing: true,
    columnResizeMode: 'onChange',
  });

  const rowHeight = 44;
  const [listHeight, setListHeight] = useState(400);
  // If the window is resized, update the list height
  useEffect(() => {
    function updateHeight() {
      // eslint-disable-next-line @eslint-react/hooks-extra/no-direct-set-state-in-use-effect
      setListHeight(Math.max(300, window.innerHeight - 300));
    }
    updateHeight();
    window.addEventListener('resize', updateHeight);
    return () => window.removeEventListener('resize', updateHeight);
  }, []);

  const headers = table.getHeaderGroups()[0].headers;
  const gridTemplateColumns = headers
    .map((header, i) =>
      i === headers.length - 1
        ? `minmax(${header.column.columnDef.minSize}px, 1fr)`
        : `${header.getSize()}px`,
    )
    .join(' ');

  return (
    <div>
      <div className="mb-3">
        <div className="d-flex flex-row justify-content-between align-items-center">
          <div className="col-md-4">
            <input
              type="text"
              id="search-input"
              className="form-control"
              placeholder="Search by UID, name, email..."
              value={globalFilter}
              onInput={(e) => {
                if (!(e.target instanceof HTMLInputElement)) {
                  return;
                }
                setGlobalFilter(e.target.value);
              }}
            />
          </div>
          <div className="text-muted">
            Showing {table.getRowModel().rows.length} of {students.length} students
          </div>
        </div>
      </div>

      <div className="border" style={{ maxHeight: listHeight + 60 }}>
        <StickyList
          height={listHeight}
          itemCount={table.getRowModel().rows.length + 1}
          itemSize={rowHeight}
          width={'100%'}
          stickyIndices={[0]}
          headerStyle={{ gridTemplateColumns, height: rowHeight }}
          table={table}
          rowHeight={rowHeight}
        >
          {(props: any) => <VirtualizedRow {...props} table={table} height={rowHeight} />}
        </StickyList>
      </div>

      {table.getRowModel().rows.length === 0 && (
        <div className="text-center text-muted py-4">
          <i className="fa fa-search fa-2x mb-2"></i>
          <p>No students found matching your search criteria.</p>
        </div>
      )}
    </div>
  );
}
