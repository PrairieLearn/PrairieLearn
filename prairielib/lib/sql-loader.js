const fs = require('fs');
const path = require('path');
const url = require('url');

module.exports.load = function (filename) {
  const sql = {};
  sql.all = fs.readFileSync(filename, 'utf8');
  const lines = sql.all.split(/\r?\n/);
  const blockRE = /^ *-- *BLOCK +([^ ]+) *$/;
  let blockName = null;
  lines.forEach((line) => {
    var result = blockRE.exec(line);
    if (result) {
      blockName = result[1];
      if (sql[blockName]) throw new Error(`${filename}: duplicate BLOCK name: ${blockName}`);
      sql[blockName] = line;
    } else if (blockName) {
      sql[blockName] += '\n' + line;
    }
  });
  return sql;
};

/**
 * Replace the extension of the given filename with ".sql" and load it.
 *
 * @param filename A path or file URL of a non-SQL file (e.g., `__filename` or `import.meta.url`).
 * @returns The SQL data structure.
 */
module.exports.loadSqlEquiv = function (filePathOrUrl) {
  let resolvedPath = filePathOrUrl;

  // This allows for us to pass `import.meta.url` to this function in ES Modules
  // environments where `__filename` is not available.
  if (filePathOrUrl.startsWith('file://')) {
    resolvedPath = url.fileURLToPath(filePathOrUrl);
  }

  const components = path.parse(resolvedPath);
  components.ext = '.sql';
  delete components.base;
  // var sqlFilename = path.format(components); // FIXME: this doesn't work in node 0.12? It should work.
  const sqlFilename = path.join(components.dir, components.name) + components.ext;
  return module.exports.load(sqlFilename);
};
