/** A temporary index includes local commits and working-tree edits without changing staging. */
export const captureReviewScript = `
const { execFileSync } = require('node:child_process');
const { lstatSync, mkdtempSync, readFileSync, rmSync } = require('node:fs');
const { tmpdir } = require('node:os');
const path = require('node:path');
const [course, branch, maxFileBytes, maxBytes] = process.argv.slice(1);
process.chdir(course);
const temp = mkdtempSync(path.join(tmpdir(), 'course-review-'));
const env = { ...process.env, GIT_INDEX_FILE: path.join(temp, 'index') };
const git = (...args) => execFileSync('git', ['--literal-pathspecs', '-c', 'safe.directory=*', ...args], { env });
try {
  git('check-ref-format', 'refs/heads/' + branch);
  const baseCommit = git('rev-parse', '--verify', 'refs/remotes/origin/' + branch + '^{commit}').toString().trim();
  git('read-tree', baseCommit);
  git('-c', 'core.autocrlf=false', '-c', 'core.filemode=true', 'add', '-A', '--', '.');
  const paths = new TextDecoder('utf-8', { fatal: true }).decode(git('diff', '--cached', '--name-only', '-z', '--no-renames', baseCommit, '--')).split('\\0').filter(Boolean);
  if (paths.length > 100) throw new Error('A review may change at most 100 files');
  const additions = [], deletions = [];
  let total = 0;
  for (const file of paths) {
    let info;
    try { info = lstatSync(file); } catch (error) { if (error.code !== 'ENOENT') throw error; }
    if (!info) { deletions.push({ path: file }); continue; }
    if (!info.isFile()) throw new Error('Unsupported course file: ' + file);
    if (info.size > Number(maxFileBytes)) throw new Error('Review file is too large: ' + file);
    const old = git('ls-tree', baseCommit, '--', file).toString();
    const mode = info.mode & 0o100 ? '100755' : '100644';
    if (mode !== '100644' || (old && old.slice(0, 6) !== mode)) throw new Error('File mode changes are not supported: ' + file);
    const contents = readFileSync(file).toString('base64');
    total += contents.length;
    if (total > Number(maxBytes)) throw new Error('Reviewed changes are too large');
    additions.push({ path: file, contents });
  }
  process.stdout.write(JSON.stringify({ baseCommit, additions, deletions }));
} finally { rmSync(temp, { recursive: true, force: true }); }
`;
