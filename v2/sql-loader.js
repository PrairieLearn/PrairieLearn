var _ = require('lodash');
var fs = require('fs');
var path = require('path');

module.exports = {};

module.exports.load = function(filename) {
    var sql = {};
    sql.all = fs.readFileSync(filename, 'utf8');
    var lines = sql.all.split(/\r?\n/);
    var blockRE = /^ *-- *BLOCK +([^ ]+) *$/;
    var blockName = null;
    _(lines).forEach(function(line) {
        result = blockRE.exec(line);
        if (result) {
            blockName = result[1];
            sql[blockName] = line;
        } else if (blockName) {
            sql[blockName] += '\n' + line;
        }
    });
    
    return sql;
};

/* Replace the extension of the given filename with ".sql" and load it.

   @param filename A filename of a non-SQL file (e.g., __filename in NodeJS).
   @return The SQL data structure.
*/
module.exports.loadSqlEquiv = function(filename) {
    var components = path.parse(filename);
    components.ext = '.sql';
    delete components.base;
    // var sqlFilename = path.format(components); // FIXME: this doesn't work in node 0.12? It should work.
    var sqlFilename = path.join(components.dir, components.name) + components.ext;
    return this.load(sqlFilename);
};
