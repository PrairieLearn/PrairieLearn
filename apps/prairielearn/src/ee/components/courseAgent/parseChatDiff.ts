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

/**
 * Reads a diff the agent wrote or ran, for the diff viewer. Agents write diffs loosely: hunk
 * headers with the wrong line counts, no hunk header, context lines without their leading space,
 * or no file names at all. Line counts are recomputed and missing headers filled in, so the viewer
 * always gets a well-formed patch for each file.
 *
 * Returns `null` for text with no added or removed lines, which should stay a plain code block.
 *
 * @param text The diff.
 * @param known The file the diff is for, used when the diff itself names no file.
 */
export function parseChatDiff(
  text: string,
  known?: { path: string; change: ChatDiffFile['change'] },
): ParsedChatDiff | null {
  if (text.length > MAX_DIFF_CHARS) return null;
  const lines = text.replaceAll('\r\n', '\n').split('\n');
  const isFileHeader = (i: number) =>
    lines[i].startsWith('--- ') && lines[i + 1]?.startsWith('+++ ');
  // Anything before the first header is a preamble, unless the whole text is a bare hunk body.
  const firstHeader = lines.findIndex(
    (line, i) => line.startsWith('diff --git ') || line.startsWith('@@') || isFileHeader(i),
  );
  const preamble = lines.slice(0, Math.max(firstHeader, 0));

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
    // Inside a hunk, a `---` line is a removed line unless a new hunk follows the pair.
    if (isFileHeader(i) && (!current.hunk || lines[i + 2]?.startsWith('@@'))) {
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

  const parsed = files.map((file) => finishFile(file, files.length === 1 ? known : undefined));
  if (!parsed.some((file) => file.additions + file.deletions > 0)) return null;
  return { preamble: preamble.join('\n').trim(), files: parsed };
}

interface MarkdownNode {
  type: string;
  lang?: string | null;
  position?: { start: { offset?: number }; end: { offset?: number } };
  data?: { hProperties?: Record<string, unknown> };
  children?: MarkdownNode[];
}

/** The property a finished diff's `<code>` element carries. */
export const COMPLETE_DIFF_PROPERTY = 'dataCompleteDiff';

/**
 * A remark plugin that marks each fenced `diff` block whose closing fence is present. While a reply
 * streams, an unfinished block is half a diff, so only marked blocks are shown in the diff viewer.
 */
export function remarkCompleteDiffs() {
  return (tree: MarkdownNode, file: { value: unknown }) => {
    const visit = (node: MarkdownNode) => {
      const start = node.position?.start.offset;
      const end = node.position?.end.offset;
      if (
        node.type === 'code' &&
        (node.lang === 'diff' || node.lang === 'patch') &&
        start !== undefined &&
        end !== undefined
      ) {
        const source = String(file.value).slice(start, end).split('\n');
        const fence = /^(`{3,}|~{3,})/.exec(source[0])?.[1];
        // The closing fence may be indented, or quoted when the block is inside a blockquote.
        const last = source
          .at(-1)!
          .replace(/^[\s>]*/, '')
          .trimEnd();
        if (
          fence &&
          source.length > 1 &&
          last.length >= fence.length &&
          last === fence[0].repeat(last.length)
        ) {
          node.data = {
            ...node.data,
            hProperties: { ...node.data?.hProperties, [COMPLETE_DIFF_PROPERTY]: true },
          };
        }
      }
      node.children?.forEach(visit);
    };
    visit(tree);
  };
}
