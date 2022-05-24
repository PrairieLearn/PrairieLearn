const execaRaw = require('execa');

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
  return execaRaw(file, args, {
    // Default to mirroring all output back to the user.
    stdout: 'inherit',
    stderr: 'inherit',
    ...options,
  });
};

// Helper for execaSudo wrapper. This supplies "sudo" as the leading command
// if the '--sudo' argument was provided to the script. If 'sudo' was already
// given as the command literally, change nothing. Return a pair with the
// leading argument separated from the rest of the argument list.
const prependSudo = (execaCommand, execaArgs = []) => {
  const processArgs = process.argv.slice(2);
  if (execaCommand !== 'sudo' && processArgs.includes('--sudo')) {
    return ['sudo', [execaCommand].concat(execaArgs)];
  } else {
    return [execaCommand, execaArgs];
  }
};

// Another wrapper for modified version of execa defined in this file: prepend
// sudo if the '--sudo' flag is passed to the calling script. This is useful
// for invoking docker on some systems.
const execaSudo = (command, args = [], options = {}) => {
  [command, args] = prependSudo(command, args);
  return execa(command, args, options);
};

const getImageTag = async () => {
  if (
    process.env.CI &&
    process.env.GITHUB_EVENT_NAME === 'pull_request' &&
    process.env.GITHUB_REF_NAME?.match(/^\d+\/merge$/)
  ) {
    // This is GitHub's automated merge commit on a pull request. However,
    // this commit doesn't actually exist on this branch, which means that
    // if we try to deploy this branch to a staging environment but tag the
    // image with the head SHA, the version that's deployed wouldn't match
    // the image tag. So, in this case, we use `HEAD^2` to get the the SHA
    // of the second parent of  the merge commit, which should be the commit
    // made by a user that actually triggered this workflow run.
    return (await execaRaw('git', ['rev-parse', 'HEAD^2'])).stdout;
  }

  return (await execaRaw('git', ['rev-parse', 'HEAD'])).stdout;
};

const getImageName = (tag) => {
  return `prairielearn/executor:${tag}`;
};

module.exports = {
  execa,
  execaSudo,
  getImageName,
  getImageTag,
};
