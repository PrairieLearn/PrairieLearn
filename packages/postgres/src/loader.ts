import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';

type SqlFile = Record<string, string>;

export function loadSql(filename: string): SqlFile {
  const sql: SqlFile = {};
  sql.all = fs.readFileSync(filename, 'utf8');
  const lines = sql.all.split(/\r?\n/);
  const blockRE = /^ *-- *BLOCK +([^ ]+) *$/;
  let blockName: string | null = null;
  lines.forEach((line) => {
    const result = blockRE.exec(line);
    if (result) {
      blockName = result[1];
      if (sql[blockName]) throw new Error(`${filename}: duplicate BLOCK name: ${blockName}`);
      sql[blockName] = line;
    } else if (blockName) {
      sql[blockName] += '\n' + line;
    }
  });
  return sql;
}

export function loadSqlEquiv(filePathOrUrl: string): SqlFile {
  let resolvedPath = filePathOrUrl;

  // This allows for us to pass `import.meta.url` to this function in ES Modules
  // environments where `__filename` is not available.
  if (filePathOrUrl.startsWith('file://')) {
    resolvedPath = url.fileURLToPath(filePathOrUrl);
  }

  const components = path.parse(resolvedPath);
  components.ext = '.sql';
  const sqlFilename = path.join(components.dir, components.name) + components.ext;
  return loadSql(sqlFilename);
}
