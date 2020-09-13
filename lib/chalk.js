// @ts-check
const { default: chalkDefault } = require('chalk');
const chalk = new chalkDefault.constructor({ enabled: true, level: 3 });

module.exports.chalk = chalk;

module.exports.chalkDim = chalk.rgb(150, 150, 150);
