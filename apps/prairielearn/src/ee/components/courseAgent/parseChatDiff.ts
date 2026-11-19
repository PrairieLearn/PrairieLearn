import { run } from '@prairielearn/run';

export interface ChatDiffFile {
  /** The file's path, or an empty string when the diff does not name one. */
  path: string;
  change: 'added' | 'modified' | 'deleted';
  /** A well-formed unified diff of this one file, or `null` for a binary file. */
  patch: string | null;
  additions: number;
  deletions: number;
  /** Whether the line numbers come from the diff, rather than counting from 1. */
  numbered: boolean;
}

export interface ParsedChatDiff {
  /** Text before the first file, such as a commit's author and message. */
  preamble: string;
  files: ChatDiffFile[];
}

/** Larger diffs stay plain text, which costs nothing to render. */
const MAX_DIFF_CHARS = 100_000;

const HUNK_HEADER = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/;
const GIT_HEADER = /^diff --git (?:a\/)?(.+?) (?:b\/)?(.+)$/;

interface Hunk {
  /** Where the hunk starts in the old and new file, when its header says. */
  start: { old: number; new: number } | null;
  lines: string[];
}

interface OpenFile {
  /** Whether the diff names this file; a `null` path then means `/dev/null`. */
  named: boolean;
  oldPath: string | null;
  newPath: string | null;
  change: ChatDiffFile['change'] | null;
  binary: boolean;
  hunks: Hunk[];
}

/** The path from a `---` or `+++` line, without a timestamp or Git's `a/` and `b/`. */
function headerPath(line: string) {
  const path = line.slice(4).split('\t')[0].trim();
  if (path === '/dev/null') return null;
  return path.replace(/^[ab]\//, '');
}

/**
 * One side of a hunk header, and the line the next hunk on that side would start at. A range of no
 * lines names the line before it, which is 0 at the top of a file.
 */
function range(given: number | undefined, next: number, count: number) {
  const first = given === undefined ? next : count === 0 ? given + 1 : given;
  return { text: `${count === 0 ? first - 1 : first},${count}`, next: first + count };
}

function finishFile(
  file: OpenFile,
  known: { path: string; change: ChatDiffFile['change'] } | undefined,
): ChatDiffFile {
  const path = file.named ? (file.newPath ?? file.oldPath ?? '') : (known?.path ?? '');
  const change = run(() => {
    if (!file.named) return known?.change ?? 'modified';
    if (file.change) return file.change;
    if (file.oldPath === null && file.newPath !== null) return 'added';
    if (file.newPath === null && file.oldPath !== null) return 'deleted';
    return 'modified';
  });

  let additions = 0;
  let deletions = 0;
  const body: string[] = [];
  let next = { old: 1, new: 1 };
  const hunks = file.hunks.filter((hunk) => hunk.lines.length > 0);
  for (const hunk of hunks) {
    const added = hunk.lines.filter((line) => line.startsWith('+')).length;
    const removed = hunk.lines.filter((line) => line.startsWith('-')).length;
    const context = hunk.lines.filter((line) => line.startsWith(' ')).length;
    const before = range(hunk.start?.old, next.old, context + removed);
    const after = range(hunk.start?.new, next.new, context + added);
    body.push(`@@ -${before.text} +${after.text} @@`, ...hunk.lines);
    next = { old: before.next, new: after.next };
    additions += added;
    deletions += removed;
  }

  // The viewer's parser needs a name on these lines even when the diff has none.
  const name = path || 'file';
  return {
    path,
    change,
    patch: file.binary
      ? null
      : [
          `--- ${change === 'added' ? '/dev/null' : name}`,
          `+++ ${change === 'deleted' ? '/dev/null' : name}`,
          ...body,
          '',
        ].join('\n'),
    additions,
    deletions,
    numbered: hunks.length > 0 && hunks.every((hunk) => hunk.start !== null),
  };
}

/** Lines that can't be read until the line after them arrives: file and hunk headers. */
const UNFINISHED_LINE = /^(?:-{1,3}|\+{1,3})$|^(?:--- |\+\+\+ |diff |@@)/;

/** How `git show` and `git format-patch` output begins, ahead of the first file. */
const COMMIT_LINE = /^(?:commit|From) [0-9a-f]{7,40}\b/;

/**
 * Reads a diff the agent wrote or ran, for the diff viewer. Agents write diffs loosely: hunk
 * headers with the wrong line counts, no hunk header, context lines without their leading space,
 * or no file names at all. Line counts are recomputed and missing headers filled in, so the viewer
 * always gets a well-formed patch for each file.
 *
 * Returns `null` when there is nothing to show, or for a very large diff.
 *
 * @param text The diff.
 * @param options
 * @param options.known The file the diff is for, used when the diff itself names no file.
 * @param options.streaming Whether more of the diff is still to come. A header at the end of the
 * text is then left out until the lines after it show what it is.
 */
export function parseChatDiff(
  text: string,
  {
    known,
    streaming = false,
  }: {
    known?: { path: string; change: ChatDiffFile['change'] };
    streaming?: boolean;
  } = {},
): ParsedChatDiff | null {
  if (text.length > MAX_DIFF_CHARS) return null;
  const lines = text.replaceAll('\r\n', '\n').split('\n');
  if (streaming) {
    if (lines.at(-1) === '') lines.pop();
    while (lines.length > 0 && UNFINISHED_LINE.test(lines.at(-1)!)) lines.pop();
  }
  const isFileHeader = (i: number) =>
    lines[i].startsWith('--- ') && lines[i + 1]?.startsWith('+++ ');
  /** Inside a hunk, such a pair of lines could also be a removed and an added line. */
  const namesOneFile = (i: number) => {
    const before = lines[i].slice(4).split('\t')[0].trim();
    const after = lines[i + 1].slice(4).split('\t')[0].trim();
    return (
      lines[i + 2]?.startsWith('@@') ||
      before === '/dev/null' ||
      after === '/dev/null' ||
      before === after ||
      (before.startsWith('a/') && after.startsWith('b/'))
    );
  };
  const firstHeader = lines.findIndex(
    (line, i) => line.startsWith('diff --git ') || line.startsWith('@@') || isFileHeader(i),
  );
  // Anything before the first header is a preamble. With no header at all, the text is a bare
  // hunk body, unless it starts like a commit whose files have not streamed in yet.
  const preamble = lines.slice(
    0,
    firstHeader === -1 && COMMIT_LINE.test(lines[0]) ? lines.length : Math.max(firstHeader, 0),
  );

  const files: OpenFile[] = [];
  const current: { hunk: Hunk | null } = { hunk: null };
  const openFile = (named: boolean) => {
    const file: OpenFile = {
      named,
      oldPath: null,
      newPath: null,
      change: null,
      binary: false,
      hunks: [],
    };
    files.push(file);
    return file;
  };
  const openHunk = (start: Hunk['start']) => {
    const hunk: Hunk = { start, lines: [] };
    (files.at(-1) ?? openFile(false)).hunks.push(hunk);
    current.hunk = hunk;
    return hunk;
  };
  const closeHunk = () => {
    const { hunk } = current;
    if (!hunk) return;
    // A blank line that ends a hunk separates it from what follows; it is not a line of the file.
    while (hunk.lines.at(-1) === '') hunk.lines.pop();
    // A blank context line is a single space, which agents and editors often trim away.
    hunk.lines = hunk.lines.map((line) => (line === '' ? ' ' : line));
    current.hunk = null;
  };

  for (let i = preamble.length; i < lines.length; i++) {
    const line = lines[i];
    const file = files.at(-1);
    const git = GIT_HEADER.exec(line);
    if (git) {
      closeHunk();
      const named = openFile(true);
      named.oldPath = git[1];
      named.newPath = git[2];
      continue;
    }
    if (isFileHeader(i) && (!current.hunk || namesOneFile(i))) {
      closeHunk();
      // A `diff --git` line has already opened this file; these lines give its exact paths.
      const named = file?.named && file.hunks.length === 0 ? file : openFile(true);
      named.oldPath = headerPath(line);
      named.newPath = headerPath(lines[i + 1]);
      i += 1;
      continue;
    }
    if (line.startsWith('@@')) {
      closeHunk();
      const header = HUNK_HEADER.exec(line);
      openHunk(header ? { old: Number(header[1]), new: Number(header[2]) } : null);
      continue;
    }
    if (file?.named && file.hunks.length === 0) {
      // Git's lines between `diff --git` and the first hunk.
      if (line.startsWith('new file mode')) file.change = 'added';
      else if (line.startsWith('deleted file mode')) file.change = 'deleted';
      else if (line.startsWith('Binary files ') || line === 'GIT binary patch') file.binary = true;
      if (!/^[-+ ]/.test(line)) continue;
    }
    // Context lines often lose their leading space when an agent writes the diff by hand.
    (current.hunk ?? openHunk(null)).lines.push(
      line === '' || /^[-+ \\]/.test(line) ? line : ` ${line}`,
    );
  }
  closeHunk();

  const shown = files.filter((file) => file.binary || file.hunks.some((h) => h.lines.length > 0));
  const preambleText = preamble.join('\n').trim();
  // A file with only its name so far is left out until its first line arrives.
  if (shown.length === 0 && (preambleText === '' || !streaming)) return null;
  return {
    preamble: preambleText,
    files: (streaming ? shown : files).map((file) =>
      finishFile(file, files.length === 1 ? known : undefined),
    ),
  };
}
