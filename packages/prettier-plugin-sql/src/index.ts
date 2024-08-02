import type { AstPath } from 'prettier';
import { formatDialect, postgresql } from 'sql-formatter';

// Loosely based on the implementation in https://github.com/un-ts/prettier/tree/master/packages/sql
postgresql.tokenizerOptions.operators?.push('<=>');

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
      return (
        formatDialect(path.node, {
          dialect: postgresql,
          paramTypes: { named: ['$'] },
        }) + '\n'
      );
    },
  },
};
export const options = {};
