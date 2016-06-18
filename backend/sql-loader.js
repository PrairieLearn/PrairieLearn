var _ = require('underscore');
var fs = require('fs');

module.exports = {};

module.exports.load = function(filename) {
    var sql = {};
    sql.all = fs.readFileSync(filename, 'utf8');
    var lines = sql.all.split('\n');
    var blockRE = /^ *-- *BLOCK +([^ ]+) *$/;
    var blockName = null;
    _(lines).each(function(line) {
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
