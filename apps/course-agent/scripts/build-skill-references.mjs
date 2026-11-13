// Copies PrairieLearn's question docs and example questions into the
// prairielearn-questions skill so the sandbox image ships the version being
// deployed. The output is gitignored; Wrangler runs this before every build.
import { execFileSync } from 'node:child_process';
import { cp, mkdir, readdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

const repo = path.resolve(import.meta.dirname, '../../..');
const dest = path.resolve(
  import.meta.dirname,
  '../container/skills/prairielearn-questions/references',
);
const TEXT_EXTENSIONS = new Set(['.html', '.py', '.json', '.md']);

async function copyMarkdown(from, to) {
  await mkdir(to, { recursive: true });
  for (const name of await readdir(from)) {
    if (name.endsWith('.md')) await cp(path.join(from, name), path.join(to, name));
  }
}

await rm(dest, { recursive: true, force: true });
await copyMarkdown(path.join(repo, 'docs/elements'), path.join(dest, 'docs/elements'));
await copyMarkdown(path.join(repo, 'docs/question'), path.join(dest, 'docs/question'));
for (const group of ['template', 'element']) {
  // Images and other assets are left out; the agent only needs the question source.
  await cp(path.join(repo, 'exampleCourse/questions', group), path.join(dest, 'examples', group), {
    recursive: true,
    filter: (src) => !path.extname(src) || TEXT_EXTENSIONS.has(path.extname(src)),
  });
}

const revision = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: repo, encoding: 'utf8' }).trim();
await writeFile(path.join(dest, 'VERSION'), `PrairieLearn ${revision}\n`);
