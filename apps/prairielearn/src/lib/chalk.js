// @ts-check
const chalkLib = require('chalk');
export const chalk = new chalkLib.Instance({ level: 3 });

/**
 * This function should be used instead of `chalk.dim`, as `ansi_up` doesn't
 * currently support the ANSI dim modifier:
 * https://github.com/drudru/ansi_up/issues/78.
 */
export const chalkDim = chalk.rgb(150, 150, 150);
