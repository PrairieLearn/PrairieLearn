const execaRaw = require('execa');

const AWS_REGION = 'us-east-2';

/**
 * Wrapper around `execa` that logs commands as they're run.
 * 
 * @param {string} file 
 * @param {string[]} args 
 * @param {import('execa').Options} [options]
 */
const execa = (file, args, options) => {
  let command = file;
  if (args) {
    command += ` ${args.join(' ')}`;
  }
  console.log(`$ ${command}`);
  return execaRaw(file, args, options);
};

const getImageTag = async () => {
  return (await execaRaw('get', ['rev-parse', 'HEAD'])).stdout;
};

const getImageName = async () => {
  const tag = await getImageTag();
  return `prairielearn/executor:${tag}`;
};

module.exports = {
  AWS_REGION,
  execa,
  getImageName,
  getImageTag,
};

