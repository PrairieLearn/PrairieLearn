import fs from 'fs-extra';
import glob from 'fast-glob';

const URL_REGEX =
  /github\.com\/PrairieLearn\/PrairieLearn\/(?:tree|blob)\/master\/([-a-zA-Z0-9@:%_+.~#?&//=]*)/;

const files = await glob('**/*.{md,html}', { ignore: ['node_modules/**'] });

let error = false;

for (const file of files) {
  const contents = await fs.readFile(file, 'utf8');

  // Extract anything that looks like a PrairieLearn source URL
  const matches = contents.match(new RegExp(URL_REGEX, 'g'));

  if (matches) {
    // console.log(file);
    // console.log(matches);
    for (const match of matches) {
      // console.log(`- ${match}`);
      // Extract the file path portion of the URL
      // let pathMatch = URL_REGEX.exec(match);
      // console.log(pathMatch);
      const filePath = match.match(URL_REGEX)[1];
      // console.log(`path: ${filePath}`);

      // Check that the file exists in the repo
      if (!(await fs.pathExists(filePath))) {
        error = true;
        console.error(`${file}: ${filePath} does not exist in the repo`);
      }
    }
    // console.log(file);
    // console.log(matches);
    // console.log(matches.groups);
  }
}

if (error) {
  process.exit(1);
}
