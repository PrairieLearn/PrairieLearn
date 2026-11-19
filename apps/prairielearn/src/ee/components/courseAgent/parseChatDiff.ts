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
export const MAX_DIFF_CHARS = 100_000;

const HUNK_HEADER = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/;
const GIT_HEADER = /^diff --git (?:a\/)?(.+?) (?:b\/)?(.+)$/;
/** Git's lines between a file's `diff --git` line and its first hunk. */
const GIT_METADATA =
  /^(?:index |(?:new|deleted) file mode |(?:old|new) mode |(?:dis)?similarity index |(?:rename|copy) (?:from|to) |Binary files |GIT binary patch$)/;

interface Hunk {
  /** Where the hunk starts in the old and new file, when its header says. */
  start: { old: number; new: number } | null;
  /** How many more old and new lines the hunk's header says it has. */
  remaining: { old: number; new: number };
  lines: string[];
}

interface OpenFile {
  /** Whether the diff names this file; a `null` path then means `/dev/null`. */
  named: boolean;
  /** Whether the file's `---` and `+++` lines have been read. */
  hasPathLines: boolean;
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
 * Returns `null` for empty text and for a very large diff.
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
  /**
   * Inside a hunk, such a pair of lines could also be a removed and an added line. Paths written
   * the way Git writes them always name a file. Otherwise the hunk's own header decides: while it
   * still expects a line on each side, the pair is two of its lines.
   */
  const namesOneFile = (i: number, hunk: Hunk) => {
    const before = lines[i].slice(4).split('\t')[0].trim();
    const after = lines[i + 1].slice(4).split('\t')[0].trim();
    if (before === '/dev/null' || after === '/dev/null') return true;
    if (before.startsWith('a/') && after.startsWith('b/')) return true;
    if (hunk.remaining.old > 0 && hunk.remaining.new > 0) return false;
    return before === after || lines[i + 2]?.startsWith('@@');
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
      hasPathLines: false,
      oldPath: null,
      newPath: null,
      change: null,
      binary: false,
      hunks: [],
    };
    files.push(file);
    return file;
  };
  const openHunk = (header: RegExpExecArray | null) => {
    const hunk: Hunk = {
      start: header ? { old: Number(header[1]), new: Number(header[3]) } : null,
      // A header that leaves a count out means one line.
      remaining: header
        ? { old: Number(header[2] || 1), new: Number(header[4] || 1) }
        : { old: 0, new: 0 },
      lines: [],
    };
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
    if (isFileHeader(i) && (!current.hunk || namesOneFile(i, current.hunk))) {
      closeHunk();
      // After a `diff --git` line, which has already opened the file, these lines give its exact
      // paths. Otherwise they start a file of their own.
      const named =
        file?.named && !file.hasPathLines && file.hunks.length === 0 ? file : openFile(true);
      named.hasPathLines = true;
      named.oldPath = headerPath(line);
      named.newPath = headerPath(lines[i + 1]);
      i += 1;
      continue;
    }
    if (line.startsWith('@@')) {
      closeHunk();
      openHunk(HUNK_HEADER.exec(line));
      continue;
    }
    if (file?.named && file.hunks.length === 0 && GIT_METADATA.test(line)) {
      if (line.startsWith('new file mode')) file.change = 'added';
      else if (line.startsWith('deleted file mode')) file.change = 'deleted';
      else if (line.startsWith('Binary files ') || line === 'GIT binary patch') file.binary = true;
      continue;
    }
    // The encoded contents of a binary file are not lines to show.
    if (file?.binary) continue;
    const hunk = current.hunk ?? openHunk(null);
    // Context lines often lose their leading space when an agent writes the diff by hand.
    const bodyLine = line === '' || /^[-+ \\]/.test(line) ? line : ` ${line}`;
    hunk.lines.push(bodyLine);
    if (!bodyLine.startsWith('+') && !bodyLine.startsWith('\\')) hunk.remaining.old -= 1;
    if (!bodyLine.startsWith('-') && !bodyLine.startsWith('\\')) hunk.remaining.new -= 1;
  }
  closeHunk();

  // While streaming, a file with only its name so far is left out until its first line arrives.
  const shown = files.filter(
    (file) =>
      file.binary || file.hunks.some((hunk) => hunk.lines.length > 0) || (file.named && !streaming),
  );
  const preambleText = preamble.join('\n').trim();
  if (shown.length === 0 && (preambleText === '' || !streaming)) return null;
  return {
    preamble: preambleText,
    files: shown.map((file) => finishFile(file, files.length === 1 ? known : undefined)),
  };
}
