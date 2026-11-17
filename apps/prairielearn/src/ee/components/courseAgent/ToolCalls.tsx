import type { ReasoningUIPart, TextUIPart } from 'ai';
import clsx from 'clsx';
import { type ReactNode, useState } from 'react';

import type { Clip, ToolCall } from '@prairielearn/course-agent-types';

import { Disclosure } from '../ai/ChatParts.js';
import { MemoizedMarkdown } from '../ai/MemoizedMarkdown.js';

/**
 * One thing the agent did on the way to its reply: a tool call, reasoning between calls, or an
 * update it wrote along the way.
 */
export type WorkItem = ToolCall | ReasoningUIPart | TextUIPart;

const isCall = (item: WorkItem): item is ToolCall => 'kind' in item;

/** Where the sandbox keeps the agent's skills, which staff cannot see. */
const SKILLS_DIR = '/etc/codex/skills/';

type Verb =
  | 'read'
  | 'list'
  | 'search'
  | 'browse'
  | 'run'
  | 'edit'
  | 'create'
  | 'delete'
  | 'call'
  | 'summarize';

const VERBS: Record<Verb, [running: string, done: string]> = {
  read: ['Reading', 'Read'],
  list: ['Listing', 'Listed'],
  search: ['Searching for', 'Searched for'],
  browse: ['Browsing', 'Browsed'],
  run: ['Running', 'Ran'],
  edit: ['Editing', 'Edited'],
  create: ['Creating', 'Created'],
  delete: ['Deleting', 'Deleted'],
  call: ['Calling', 'Called'],
  summarize: ['Summarizing', 'Summarized'],
};

/** Codex runs commands through a login shell; the inner script is what the agent wrote. */
function unwrapShell(command: string) {
  const shell = /^(?:\S*\/)?(?:ba|z)?sh -l?c /.exec(command.trim());
  if (!shell) return command;
  // Only a single quoted argument is the whole script; anything after it is not unwrapped.
  const script = command.trim().slice(shell[0].length);
  const single = /^'((?:[^']|'\\'')*)'$/.exec(script);
  if (single) return single[1].replaceAll("'\\''", "'");
  const double = /^"((?:[^"\\]|\\[\s\S])*)"$/.exec(script);
  if (double) return double[1].replaceAll(/\\(["\\$`])/g, '$1');
  return command;
}

/** The narrow chat panel would truncate a full path before its file name. */
function FileName({ path }: { path: string }) {
  return <Code title={path}>{path.split('/').slice(-2).join('/')}</Code>;
}

function Code({ children, title }: { children: ReactNode; title?: string }) {
  return (
    <code className="text-body bg-body-tertiary rounded px-1" title={title}>
      {children}
    </code>
  );
}

const toolName = (call: Extract<ToolCall, { kind: 'tool' }>) =>
  call.server ? `${call.server}.${call.tool}` : call.tool;

const count = (n: number, noun: string) => `${n} ${noun}${n === 1 ? '' : 's'}`;

/**
 * What a call does, for grouping consecutive calls of one kind into a row like "Read 3 files".
 * Groups count calls, so a command that reads two files counts once.
 */
function category(call: ToolCall): {
  key: string;
  /** A Bootstrap icon for the action, so reads, edits, and runs differ at a glance. */
  icon: string;
  group: (count: number) => string;
} {
  switch (call.kind) {
    case 'command': {
      const types = new Set(call.actions.map((action) => action.type));
      if (types.size === 1 && types.has('read')) {
        return {
          key: 'read',
          icon: 'bi-file-earmark-text',
          group: (n) => `Read ${count(n, 'file')}`,
        };
      }
      if (call.actions.length === 1 && types.has('listFiles')) {
        return {
          key: 'list',
          icon: 'bi-folder2-open',
          group: (n) => `Listed ${count(n, 'folder')}`,
        };
      }
      if (call.actions.length === 1 && types.has('search')) {
        return { key: 'search', icon: 'bi-search', group: (n) => `Searched ${count(n, 'time')}` };
      }
      return { key: 'run', icon: 'bi-terminal', group: (n) => `Ran ${count(n, 'command')}` };
    }
    case 'fileChange':
      return { key: 'edit', icon: 'bi-pencil-square', group: (n) => `Made ${count(n, 'edit')}` };
    case 'tool':
      if (call.server === 'web') {
        return {
          key: 'web',
          icon: 'bi-globe',
          group: (n) => `Browsed the web ${count(n, 'time')}`,
        };
      }
      return {
        key: `call:${toolName(call)}`,
        icon: 'bi-plug',
        group: (n) => `Called ${toolName(call)} ${count(n, 'time')}`,
      };
    case 'compaction':
      return {
        key: 'compaction',
        icon: 'bi-arrows-collapse',
        group: (n) => `Summarized earlier conversation ${count(n, 'time')}`,
      };
  }
}

/** A label built only from the call's own fields, so new tools need no copy of their own. */
function describe(call: ToolCall): { verb: Verb; subject: ReactNode; meta?: string } {
  switch (call.kind) {
    case 'command': {
      const { actions } = call;
      const [action] = actions;
      if (category(call).key === 'read') {
        return {
          verb: 'read',
          subject: actions.map((read, i) => (
            // A command may read the same file twice.
            // oxlint-disable-next-line react/no-array-index-key
            <span key={i}>
              {i > 0 && ', '}
              {read.type === 'read' && <FileName path={read.path} />}
            </span>
          )),
        };
      }
      if (actions.length === 1 && action.type === 'listFiles') {
        return { verb: 'list', subject: <Code>{action.path ?? 'files'}</Code> };
      }
      if (actions.length === 1 && action.type === 'search') {
        return {
          verb: 'search',
          subject: (
            <>
              <Code>{action.query ?? 'files'}</Code>
              {action.path && (
                <>
                  {' in '}
                  <Code>{action.path}</Code>
                </>
              )}
            </>
          ),
        };
      }
      return { verb: 'run', subject: <Code>{unwrapShell(call.command).split('\n')[0]}</Code> };
    }
    case 'fileChange': {
      const meta = changeMeta([call]);
      const count = call.changes.length + call.omittedChanges;
      if (count !== 1) return { verb: 'edit', subject: `${count} files`, meta };
      const [change] = call.changes;
      const verb =
        change.change === 'add' ? 'create' : change.change === 'delete' ? 'delete' : 'edit';
      return { verb, subject: <FileName path={change.path} />, meta };
    }
    case 'tool':
      if (call.server === 'web') return describeWeb(call.tool, call.arguments.text);
      return { verb: 'call', subject: <Code>{toolName(call)}</Code> };
    case 'compaction':
      return { verb: 'summarize', subject: 'earlier conversation' };
  }
}

/**
 * Codex's web tool. Its arguments are the page URL, if any, and then Codex's summary of the query,
 * page, or pattern. Opening a search result by reference, and a call still starting, have neither.
 */
function describeWeb(action: string, text: string): { verb: Verb; subject: ReactNode } {
  const lines = text.split('\n').filter(Boolean);
  if (action === 'openPage' && lines.length > 0) {
    return { verb: 'read', subject: <Code>{lines[0]}</Code> };
  }
  if ((action === 'search' || action === 'findInPage') && lines.length > 0) {
    return { verb: 'search', subject: <Code>{lines.at(-1)}</Code> };
  }
  return { verb: 'browse', subject: 'the web' };
}

function changeMeta(calls: ToolCall[]) {
  const changes = calls.flatMap((call) => (call.kind === 'fileChange' ? call.changes : []));
  const added = changes.reduce((sum, change) => sum + change.added, 0);
  const removed = changes.reduce((sum, change) => sum + change.removed, 0);
  return `+${added} −${removed}`;
}

/** A running call in a message that is no longer streaming was cut off. */
function statusOf(call: ToolCall, live: boolean): ToolCall['status'] {
  return call.status === 'running' && !live ? 'interrupted' : call.status;
}

function statusNote(call: ToolCall, live: boolean) {
  const status = statusOf(call, live);
  if (status === 'interrupted') return { text: 'Interrupted', failed: false };
  if (call.kind === 'command' && call.exitCode !== null && call.exitCode !== 0) {
    return { text: `Exit ${call.exitCode}`, failed: true };
  }
  return status === 'failed' ? { text: 'Failed', failed: true } : null;
}

/** The collapsed line: icon, label, and status in text as well as colour. */
function Summary({
  icon,
  running,
  label,
  meta,
  note,
}: {
  icon: string;
  running: boolean;
  label: ReactNode;
  meta?: string;
  note: { text: string; failed: boolean } | null;
}) {
  return (
    <span className="d-flex align-items-center gap-2 small overflow-hidden flex-grow-1">
      {/* One fixed-width slot, sized to the icon, keeps the icons in a column. */}
      <span
        className="d-inline-flex justify-content-center flex-shrink-0"
        style={{ width: '1.25em' }}
        aria-hidden="true"
      >
        <i className={clsx('bi', icon, note?.failed && 'text-danger')} />
      </span>
      <span className={clsx('text-truncate', running && 'course-agent-shimmer')}>{label}</span>
      {/* The spaces separate words in the button's accessible name; flex layout drops them. */}
      {meta && <span className="flex-shrink-0"> {meta}</span>}
      {running && <span className="visually-hidden"> (in progress)</span>}
      {note && (
        <span className={clsx('flex-shrink-0 fw-semibold', note.failed && 'text-danger')}>
          {' '}
          {note.text}
        </span>
      )}
    </span>
  );
}

function Row({
  summary,
  tail,
  onExpand,
  children,
}: {
  summary: ReactNode;
  /** Shown under the collapsed line; the details replace it when the row opens. */
  tail?: ReactNode;
  onExpand?: () => void;
  children: ReactNode;
}) {
  const [expanded, setExpanded] = useState(false);
  return (
    <div>
      <Disclosure
        summary={summary}
        expanded={expanded}
        onToggle={() => {
          if (!expanded) onExpand?.();
          setExpanded(!expanded);
        }}
      >
        <div className="d-flex flex-column gap-1 mt-1 mb-2 ms-4">{children}</div>
      </Disclosure>
      {!expanded && tail}
    </div>
  );
}

/** The end of a running command's output, so a long command shows that it is getting somewhere. */
export function LiveOutput({ call, lines: count = 4 }: { call?: ToolCall | null; lines?: number }) {
  if (call?.kind !== 'command' || !call.output?.text.trim()) return null;
  const lines = call.output.text
    .trimEnd()
    .split('\n')
    .slice(-count)
    // A progress bar rewrites its line; only the last rewrite is on screen.
    .map((line) => line.split('\r').at(-1));
  return (
    <pre className="course-agent-live-output text-body-secondary mb-0 mt-1 ms-4" aria-hidden="true">
      {lines.join('\n')}
    </pre>
  );
}

/**
 * What a running call is doing, for the chat's status line. Many staff are not technical, so it
 * names files but never shows a command.
 */
export function runningLabel(call: ToolCall): string {
  const name = (path: string) => path.split('/').at(-1);
  switch (call.kind) {
    case 'command': {
      const { key } = category(call);
      if (key === 'read') {
        const paths = call.actions.flatMap((action) =>
          action.type === 'read' ? [action.path] : [],
        );
        if (paths.every((path) => path.startsWith(SKILLS_DIR))) return 'Checking guidance';
        return paths.length === 1 ? `Reading ${name(paths[0])}` : `Reading ${paths.length} files`;
      }
      if (key === 'list') return 'Looking through the course files';
      if (key === 'search') return 'Searching the course files';
      return 'Running a command';
    }
    case 'fileChange': {
      const total = call.changes.length + call.omittedChanges;
      if (total !== 1) return `Editing ${total} files`;
      const [{ change, path }] = call.changes;
      const verb = change === 'add' ? 'Creating' : change === 'delete' ? 'Deleting' : 'Editing';
      return `${verb} ${name(path)}`;
    }
    case 'tool':
      if (call.server !== 'web') return 'Getting information';
      return call.tool === 'search' ? 'Searching the web' : 'Reading a web page';
    case 'compaction':
      return 'Summarizing earlier conversation';
  }
}

function ToolCallRow({
  call,
  live,
  onExpand,
}: {
  call: ToolCall;
  live: boolean;
  onExpand?: () => void;
}) {
  const running = statusOf(call, live) === 'running';
  const { verb, subject, meta } = describe(call);
  return (
    <Row
      summary={
        <Summary
          icon={category(call).icon}
          running={running}
          label={
            <>
              {VERBS[verb][running ? 0 : 1]} {subject}
            </>
          }
          meta={meta}
          note={statusNote(call, live)}
        />
      }
      tail={running && <LiveOutput call={call} />}
      onExpand={onExpand}
    >
      <ToolCallDetails call={call} />
    </Row>
  );
}

/** Codex heads each section of a reasoning summary with a bold title; the latest names the topic. */
export function reasoningHeading(text: string) {
  return [...text.matchAll(/\*\*(.+?)\*\*/g)].at(-1)?.[1] ?? null;
}

function ReasoningRow({
  part,
  live,
  onExpand,
}: {
  part: ReasoningUIPart;
  live: boolean;
  onExpand?: () => void;
}) {
  return (
    <Row
      summary={
        <Summary
          icon="bi-lightbulb"
          running={live && part.state === 'streaming'}
          label={reasoningHeading(part.text) ?? 'Thinking'}
          note={null}
        />
      }
      onExpand={onExpand}
    >
      <div className="markdown-body small text-body-secondary">
        <MemoizedMarkdown content={part.text} />
      </div>
    </Row>
  );
}

/** What a group of calls did and how it went, for a line that stands in for all of them. */
function groupSummary(calls: ToolCall[], live: boolean) {
  const notes = calls.map((call) => statusNote(call, live));
  const failures = notes.filter((note) => note?.failed).length;
  return {
    running: calls.some((call) => statusOf(call, live) === 'running'),
    meta: calls.some((call) => call.kind === 'fileChange') ? changeMeta(calls) : undefined,
    note:
      failures > 0
        ? { text: `${failures} failed`, failed: true }
        : (notes.find((note) => note) ?? null),
  };
}

/** Calls of one kind in a row, as one line like "Read 3 files". */
function CallGroup({
  group,
  live,
  onExpand,
}: {
  group: ToolCall[];
  live: boolean;
  onExpand?: () => void;
}) {
  if (group.length === 1) return <ToolCallRow call={group[0]} live={live} onExpand={onExpand} />;
  return (
    <Row
      summary={
        <Summary
          icon={category(group[0]).icon}
          label={category(group[0]).group(group.length)}
          {...groupSummary(group, live)}
        />
      }
      tail={<LiveOutput call={group.find((call) => statusOf(call, live) === 'running')} />}
      onExpand={onExpand}
    >
      {group.map((call, i) => (
        // oxlint-disable-next-line react/no-array-index-key
        <ToolCallRow key={i} call={call} live={live} onExpand={onExpand} />
      ))}
    </Row>
  );
}

/**
 * Everything the agent did before a reply, folded into one line so the chat reads as its replies.
 * Opening it shows each step, with calls of the same kind grouped.
 */
export function Work({
  items,
  live,
  settled,
  showUpdate,
  onExpand,
}: {
  items: WorkItem[];
  /** Whether the message is still streaming; otherwise a running call was cut off. */
  live: boolean;
  /** Whether this work is over. */
  settled: boolean;
  /** Whether to show the agent's latest update under the line while it works. */
  showUpdate: boolean;
  /** Called before a row opens, which makes the chat taller. */
  onExpand?: () => void;
}) {
  const rows: (ToolCall[] | ReasoningUIPart | TextUIPart)[] = [];
  for (const item of items) {
    const last = rows.at(-1);
    if (!isCall(item)) rows.push(item);
    else if (Array.isArray(last) && category(last[0]).key === category(item).key) last.push(item);
    else rows.push([item]);
  }
  // Rows only ever append to a streaming message, so their positions identify them.
  const rendered = rows.map((row, i) =>
    Array.isArray(row) ? (
      // oxlint-disable-next-line react/no-array-index-key
      <CallGroup key={i} group={row} live={live} onExpand={onExpand} />
    ) : row.type === 'reasoning' ? (
      // oxlint-disable-next-line react/no-array-index-key
      <ReasoningRow key={i} part={row} live={live} onExpand={onExpand} />
    ) : (
      // oxlint-disable-next-line react/no-array-index-key
      <Update key={i} text={row.text} />
    ),
  );
  // A lone step says more as its own line than as "1 step".
  if (settled && rows.length === 1) return rendered[0];
  const calls = items.filter(isCall).length;
  const updates = items.filter((item): item is TextUIPart => !isCall(item) && item.type === 'text');
  const update = updates.at(-1);
  return (
    <Row
      summary={
        <Summary
          icon="bi-list-ul"
          running={false}
          label={
            calls === 0
              ? settled
                ? 'Thought it through'
                : 'Thinking'
              : settled
                ? `Worked through ${count(calls, 'step')}`
                : `Working · ${count(calls, 'step')}`
          }
          note={null}
        />
      }
      // While it works, the agent's latest update says where it has got to.
      tail={!settled && showUpdate && update && <Update text={update.text} indented />}
      onExpand={onExpand}
    >
      {rendered}
    </Row>
  );
}

/** Something the agent wrote along the way, which is not part of its reply. */
function Update({ text, indented = false }: { text: string; indented?: boolean }) {
  return (
    <div className={clsx('markdown-body small text-body-secondary', indented && 'ms-4 mt-1')}>
      <MemoizedMarkdown content={text} />
    </div>
  );
}

function ToolCallDetails({ call }: { call: ToolCall }) {
  switch (call.kind) {
    case 'command':
      return (
        <Output label="Command output" clip={call.output}>
          <span className="text-body-secondary">$ </span>
          {unwrapShell(call.command)}
          {'\n'}
          {call.output ? (
            call.output.text
          ) : (
            <span className="text-body-secondary">(no output)</span>
          )}
        </Output>
      );
    case 'fileChange':
      return (
        <>
          {call.changes.map((change, i) => (
            // A patch can list the same path more than once.
            // oxlint-disable-next-line react/no-array-index-key
            <div key={i}>
              <div className="small">
                <Code>{change.movePath ? `${change.path} → ${change.movePath}` : change.path}</Code>{' '}
                <span className="text-body-secondary">
                  +{change.added} −{change.removed}
                </span>
              </div>
              <Output label={`Changes to ${change.path}`} clip={change.diff}>
                <DiffLines diff={change.diff.text} />
              </Output>
            </div>
          ))}
          {call.omittedChanges > 0 && (
            <div className="small text-body-secondary">
              {call.omittedChanges} more {call.omittedChanges === 1 ? 'file' : 'files'} not shown
            </div>
          )}
        </>
      );
    case 'tool':
      return (
        <>
          <Output label="Arguments" clip={call.arguments}>
            {call.arguments.text || <span className="text-body-secondary">(no arguments)</span>}
          </Output>
          {call.output && (
            <Output label="Result" clip={call.output}>
              {call.output.text}
            </Output>
          )}
          {call.error && <div className="small text-danger">{call.error}</div>}
        </>
      );
    case 'compaction':
      return (
        <div className="small text-body-secondary">
          The conversation got long, so the agent replaced earlier messages with a summary to make
          room. It may not remember every detail from before this point.
        </div>
      );
  }
}

function DiffLines({ diff }: { diff: string }) {
  return diff
    .replace(/\n$/, '')
    .split('\n')
    .map((line, i) => (
      <div
        // Diff lines have no identity beyond their position.
        // oxlint-disable-next-line react/no-array-index-key
        key={i}
        className={clsx({
          'bg-success-subtle': line.startsWith('+'),
          'bg-danger-subtle': line.startsWith('-'),
          'text-body-secondary': line.startsWith('@@'),
        })}
      >
        {line || ' '}
      </div>
    ));
}

/** A scrollable, keyboard-focusable block of text, noting what history did not keep. */
function Output({
  label,
  clip,
  children,
}: {
  label: string;
  clip: Clip | null;
  children: ReactNode;
}) {
  return (
    <div>
      <pre
        className="bg-body-tertiary border rounded p-2 mb-0 small overflow-auto"
        style={{ maxHeight: '20rem', whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}
        // Scrollable regions must be reachable by keyboard.
        // oxlint-disable-next-line jsx-a11y/no-noninteractive-tabindex
        tabIndex={0}
        role="region"
        aria-label={label}
      >
        {children}
      </pre>
      {clip && clip.omitted > 0 && (
        <div className="small text-body-secondary">
          {clip.text
            ? `${clip.omitted.toLocaleString()} characters not shown`
            : `Not kept in this conversation (${clip.omitted.toLocaleString()} characters)`}
        </div>
      )}
    </div>
  );
}
