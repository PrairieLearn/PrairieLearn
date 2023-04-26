// @ts-check
import fs from 'fs-extra';

const packages = await fs.readdir('./packages');
const apps = await fs.readdir('./apps');

const dockerfileContents = await fs.readFile('./Dockerfile', 'utf8');

const dockerfileLines = dockerfileContents.split('\n');

/**
 *
 * @param {string} prefix
 * @param {string[]} directories
 * @returns {Promise<string[]>}
 */
async function validatePackageJsonCopy(prefix, directories) {
  const missingLines = [];
  for (const directory of directories) {
    const desiredLine = `COPY ${prefix}/${directory}/package.json /PrairieLearn/${prefix}/${directory}/package.json`;

    // This handles the case of packages where we need to copy the entire
    // directory, not just `package.json`. This is generally only the case for
    // packages with native components that will be built during installation.
    const alternativeLine = `COPY ${prefix}/${directory}/ /PrairieLearn/${prefix}/${directory}/`;

    if (!dockerfileLines.includes(desiredLine) && !dockerfileLines.includes(alternativeLine)) {
      missingLines.push(desiredLine);
    }
  }
  return missingLines;
}

const missingPackageLines = await validatePackageJsonCopy('packages', packages);
const missingAppsLines = await validatePackageJsonCopy('apps', apps);

const missingLines = [...missingPackageLines, ...missingAppsLines];
if (missingLines.length > 0) {
  console.error('Ensure that the following lines are present in the Dockerfile:\n');
  missingLines.forEach((line) => console.error(line));
  process.exit(1);
}

console.log('Dockerfile is valid!');
