import fs from 'fs-extra';
import glob from 'fast-glob';

const URL_REGEX =
  /github\.com\/PrairieLearn\/PrairieLearn\/(?:tree|blob)\/master\/([-a-zA-Z0-9@:%_+.~#?&//=]*)/;

function filePathFromUrl(url) {
  let path = url.match(URL_REGEX)[1];

  // Some URLs include hashes at the end - strip them off
  path = path.replace(/#.*$/, '');

  // Remove any trailing slashes as well
  path = path.replace(/\/$/, '');

  return path;
}

const files = await glob('**/*.{md,html,json}', { ignore: ['node_modules/**'] });

let error = false;

for (const file of files) {
  const contents = await fs.readFile(file, 'utf8');

  // Extract anything that looks like a PrairieLearn source URL
  const matches = contents.match(new RegExp(URL_REGEX, 'g'));

  if (matches) {
    for (const match of matches) {
      // Extract the file path portion of the URL
      const filePath = filePathFromUrl(match);

      // Check that the file exists in the repo
      if (!(await fs.pathExists(filePath))) {
        error = true;
        console.error(`${file}: ${filePath} does not exist in the repo`);
      }
    }
  }
}

if (error) {
  process.exit(1);
}
