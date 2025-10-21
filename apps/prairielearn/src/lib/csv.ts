import type Stream from 'node:stream';

import { type Options, type Parser, parse } from 'csv-parse';

const DEFAULT_CSV_PARSE_OPTIONS: Options = {
  columns: true, // first line is header
  info: true, // include line number info
  bom: true, // handle byte order mark if present (sometimes present in files from Excel)
  trim: true, // trim whitespace around values
  skipEmptyLines: true,
  relaxColumnCount: true, // allow rows with different number of columns
};

export function createCsvParser(
  stream: Stream.Readable,
  {
    integerColumns,
    floatColumns,
    lowercaseHeader = true,
    ...customOptions
  }: {
    integerColumns?: string[];
    floatColumns?: string[];
    lowercaseHeader?: boolean;
  } & Options = {},
): Parser {
  return stream.pipe(
    parse({
      ...DEFAULT_CSV_PARSE_OPTIONS,
      cast: (value, context) => {
        if (value === '') return null;
        if (context.header) return lowercaseHeader ? value.toLowerCase() : value;

        if (integerColumns?.includes(context.column.toString())) return Number.parseInt(value);
        if (floatColumns?.includes(context.column.toString())) return Number.parseFloat(value);
        return value;
      },
      ...customOptions,
    }),
  );
}
