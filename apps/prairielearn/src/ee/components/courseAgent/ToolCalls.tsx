import type { ReasoningUIPart } from 'ai';
import clsx from 'clsx';
import { type ReactNode, useState } from 'react';

import type { Clip, ToolCall } from '@prairielearn/course-agent-types';

import { Disclosure } from '../ai/ChatParts.js';
import { MemoizedMarkdown } from '../ai/MemoizedMarkdown.js';

/** One thing the agent did on the way to its reply: a tool call, or reasoning between calls. */
export type Step = ToolCall | ReasoningUIPart;

const isCall = (step: Step): step is ToolCall => 'kind' in step;

const LIVE_OUTPUT_LINES = 4;

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
function LiveOutput({ call }: { call: ToolCall | undefined }) {
  if (call?.kind !== 'command' || !call.output?.text.trim()) return null;
  const lines = call.output.text
    .trimEnd()
    .split('\n')
    .slice(-LIVE_OUTPUT_LINES)
    // A progress bar rewrites its line; only the last rewrite is on screen.
    .map((line) => line.split('\r').at(-1));
  return (
    <pre className="course-agent-live-output text-body-secondary mb-0 mt-1 ms-4" aria-hidden="true">
      {lines.join('\n')}
    </pre>
  );
}

/** What a running call is doing, for the chat's status line. */
export function RunningToolCallLabel({ call }: { call: ToolCall }) {
  const { verb, subject } = describe(call);
  return (
    <>
      {VERBS[verb][0]} {subject}…
    </>
  );
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

/** "Read 3 files, ran 2 commands", counting each kind of call in the order it first happened. */
function countCalls(calls: ToolCall[]) {
  const counts = new Map<string, { call: ToolCall; n: number }>();
  for (const call of calls) {
    const { key } = category(call);
    const entry = counts.get(key);
    if (entry) entry.n += 1;
    else counts.set(key, { call, n: 1 });
  }
  return [...counts.values()]
    .map(({ call, n }) => category(call).group(n))
    .map((phrase, i) => (i === 0 ? phrase : phrase[0].toLowerCase() + phrase.slice(1)))
    .join(', ');
}

/**
 * The agent's consecutive steps from one message, with calls of the same kind grouped. Once the
 * agent has moved on, the steps fold into one line so the chat reads as its replies.
 */
export function Steps({
  steps,
  live,
  settled,
  onExpand,
}: {
  steps: Step[];
  /** Whether the steps' message is still streaming; otherwise a running call was cut off. */
  live: boolean;
  /** Whether the agent has moved on from these steps. */
  settled: boolean;
  /** Called before a row opens, which makes the chat taller. */
  onExpand?: () => void;
}) {
  const rows: (ToolCall[] | ReasoningUIPart)[] = [];
  for (const step of steps) {
    const last = rows.at(-1);
    if (!isCall(step)) rows.push(step);
    else if (Array.isArray(last) && category(last[0]).key === category(step).key) last.push(step);
    else rows.push([step]);
  }
  // Rows only ever append to a streaming message, so their positions identify them.
  const rendered = rows.map((row, i) =>
    Array.isArray(row) ? (
      // oxlint-disable-next-line react/no-array-index-key
      <CallGroup key={i} group={row} live={live} onExpand={onExpand} />
    ) : (
      // oxlint-disable-next-line react/no-array-index-key
      <ReasoningRow key={i} part={row} live={live} onExpand={onExpand} />
    ),
  );
  if (!settled || rows.length < 2) {
    return <div className="d-flex flex-column gap-1">{rendered}</div>;
  }
  const calls = steps.filter(isCall);
  const thoughts = steps.filter((step): step is ReasoningUIPart => !isCall(step));
  // A lone call keeps its own line, which says more than "Ran 1 command".
  const only = calls.length === 1 ? describe(calls[0]) : null;
  return (
    <Row
      summary={
        <Summary
          icon={only ? category(calls[0]).icon : 'bi-list-ul'}
          label={
            only ? (
              <>
                {VERBS[only.verb][1]} {only.subject}
              </>
            ) : calls.length > 0 ? (
              countCalls(calls)
            ) : (
              (reasoningHeading(thoughts.at(-1)!.text) ?? 'Thinking')
            )
          }
          {...groupSummary(calls, live)}
        />
      }
      onExpand={onExpand}
    >
      {rendered}
    </Row>
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
