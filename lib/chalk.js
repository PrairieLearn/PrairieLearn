// @ts-check
const chalkLib = require('chalk');
const chalk = new chalkLib.Instance({ level: 3 });

module.exports.chalk = chalk;

module.exports.chalkDim = chalk.rgb(150, 150, 150);
