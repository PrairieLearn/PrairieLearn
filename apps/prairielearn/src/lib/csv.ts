import type Stream from 'node:stream';

import { type Options, type Parser, parse } from 'csv-parse';

const DEFAULT_CSV_PARSE_OPTIONS: Options = {
  columns: (header) => header.map((column) => column.toLowerCase()),
  info: true, // include line number info
  bom: true, // handle byte order mark if present (sometimes present in files from Excel)
  trim: true, // trim whitespace around values
  skipEmptyLines: true,
  relaxColumnCount: true, // allow rows with different number of columns
  maxRecordSize: 10000,
};

export function createCsvParser(
  stream: Stream.Readable,
  { integerColumns, floatColumns }: { integerColumns?: string[]; floatColumns?: string[] } = {},
): Parser {
  return stream.pipe(
    parse({
      ...DEFAULT_CSV_PARSE_OPTIONS,
      cast: (value, context) => {
        if (value === '') return null;
        if (context.header) return value; // do not cast header row

        if (integerColumns?.includes(context.column.toString())) return Number.parseInt(value);
        if (floatColumns?.includes(context.column.toString())) return Number.parseFloat(value);
        return value;
      },
    }),
  );
}
