// @ts-check
const chalkLib = require('chalk');
const chalk = new chalkLib.Instance({ level: 3 });

module.exports.chalk = chalk;

/**
 * This function should be used instead of `chalk.dim`, as `ansi_up` doesn't
 * currently support the ANSI dim modifier:
 * https://github.com/drudru/ansi_up/issues/78.
 */
module.exports.chalkDim = chalk.rgb(150, 150, 150);
