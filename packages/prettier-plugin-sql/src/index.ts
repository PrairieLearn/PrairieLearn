import type { AstPath } from 'prettier';
import { format } from 'sql-formatter';

// Loosely based on the implementation in https://github.com/un-ts/prettier/tree/master/packages/sql

export const languages = [
  {
    name: 'SQL',
    parsers: ['sql'],
    extensions: ['.sql'],
  },
];
export const parsers = {
  sql: {
    parse: (text: string) => text,
    astFormat: 'sql',
    locStart: () => -1,
    locEnd: () => -1,
  },
};
export const printers = {
  sql: {
    print(path: AstPath) {
      const formatted = format(path.getValue(), {
        language: 'postgresql',
        paramTypes: { named: ['$'] },
      }).replace(/\r\n?/g, '\n');
      return formatted.endsWith('\n') ? formatted : formatted + '\n';
    },
  },
};
export const options = {};
