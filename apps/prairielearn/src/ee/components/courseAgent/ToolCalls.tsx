import clsx from 'clsx';
import { type ReactNode, useState } from 'react';
import { Spinner } from 'react-bootstrap';

import type { Clip, ToolCall } from '@prairielearn/course-agent-types';

import { Disclosure } from '../ai/ChatParts.js';

type Verb = 'read' | 'list' | 'search' | 'run' | 'edit' | 'create' | 'delete' | 'move' | 'call';

const VERBS: Record<Verb, [running: string, done: string]> = {
  read: ['Reading', 'Read'],
  list: ['Listing', 'Listed'],
  search: ['Searching for', 'Searched for'],
  run: ['Running', 'Ran'],
  edit: ['Editing', 'Edited'],
  create: ['Creating', 'Created'],
  delete: ['Deleting', 'Deleted'],
  move: ['Moving', 'Moved'],
  call: ['Calling', 'Called'],
};

const ICONS: Record<ToolCall['kind'], string> = {
  command: 'bi-terminal',
  fileChange: 'bi-file-earmark-diff',
  tool: 'bi-plug',
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

/**
 * What a call does, for grouping consecutive calls of one kind into a row like "Read 3 files".
 * Groups count calls, so a command that reads two files counts once.
 */
function category(call: ToolCall): { key: string; group: (count: number) => string } {
  switch (call.kind) {
    case 'command': {
      const types = new Set(call.actions.map((action) => action.type));
      if (types.size === 1 && types.has('read')) {
        return { key: 'read', group: (n) => `Read ${n} files` };
      }
      if (call.actions.length === 1 && types.has('listFiles')) {
        return { key: 'list', group: (n) => `Listed ${n} folders` };
      }
      if (call.actions.length === 1 && types.has('search')) {
        return { key: 'search', group: (n) => `Searched ${n} times` };
      }
      return { key: 'run', group: (n) => `Ran ${n} commands` };
    }
    case 'fileChange':
      return { key: 'edit', group: (n) => `Made ${n} edits` };
    case 'tool':
      return { key: `call:${toolName(call)}`, group: (n) => `Called ${toolName(call)} ${n} times` };
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
      if (change.movePath) {
        return {
          verb: 'move',
          subject: (
            <>
              <FileName path={change.path} /> to <FileName path={change.movePath} />
            </>
          ),
          meta,
        };
      }
      const verb =
        change.change === 'add' ? 'create' : change.change === 'delete' ? 'delete' : 'edit';
      return { verb, subject: <FileName path={change.path} />, meta };
    }
    case 'tool':
      // Web search is Codex's one built-in tool here; its argument is the query or page.
      if (call.server === 'web') {
        return {
          verb: call.tool === 'openPage' ? 'read' : 'search',
          subject: <Code>{call.arguments.text.split('\n')[0] || 'the web'}</Code>,
        };
      }
      return { verb: 'call', subject: <Code>{toolName(call)}</Code> };
  }
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
  if (status === 'declined') return { text: 'Declined', failed: true };
  if (call.kind === 'command' && call.exitCode !== null && call.exitCode !== 0) {
    return { text: `Exit ${call.exitCode}`, failed: true };
  }
  return status === 'failed' ? { text: 'Failed', failed: true } : null;
}

/** The collapsed line: icon or spinner, label, and status in text as well as colour. */
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
      {running ? (
        <Spinner animation="border" size="sm" className="flex-shrink-0" aria-hidden="true" />
      ) : (
        <i
          className={clsx('bi flex-shrink-0', icon, note?.failed && 'text-danger')}
          aria-hidden="true"
        />
      )}
      <span className="text-truncate">{label}</span>
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
  onExpand,
  children,
}: {
  summary: ReactNode;
  onExpand?: () => void;
  children: ReactNode;
}) {
  const [expanded, setExpanded] = useState(false);
  return (
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
          icon={ICONS[call.kind]}
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
      onExpand={onExpand}
    >
      <ToolCallDetails call={call} />
    </Row>
  );
}

/** Consecutive tool calls from one message, with runs of the same kind grouped. */
export function ToolCalls({
  calls,
  live,
  onExpand,
}: {
  calls: ToolCall[];
  /** Whether the calls' message is still streaming; otherwise a running call was cut off. */
  live: boolean;
  /** Called before a row opens, which makes the chat taller. */
  onExpand?: () => void;
}) {
  const groups: ToolCall[][] = [];
  for (const call of calls) {
    const last = groups.at(-1);
    if (last && category(last[0]).key === category(call).key) last.push(call);
    else groups.push([call]);
  }
  // Rows only ever append to a streaming message, so their positions identify them.
  return (
    <div className="d-flex flex-column gap-1">
      {groups.map((group, i) => {
        if (group.length === 1) {
          // oxlint-disable-next-line react/no-array-index-key
          return <ToolCallRow key={i} call={group[0]} live={live} onExpand={onExpand} />;
        }
        const notes = group.map((call) => statusNote(call, live));
        const failures = notes.filter((note) => note?.failed).length;
        return (
          <Row
            // oxlint-disable-next-line react/no-array-index-key
            key={i}
            summary={
              <Summary
                icon={ICONS[group[0].kind]}
                running={group.some((call) => statusOf(call, live) === 'running')}
                label={category(group[0]).group(group.length)}
                meta={group[0].kind === 'fileChange' ? changeMeta(group) : undefined}
                note={
                  failures > 0
                    ? { text: `${failures} failed`, failed: true }
                    : (notes.find((note) => note) ?? null)
                }
              />
            }
            onExpand={onExpand}
          >
            {group.map((call, j) => (
              // oxlint-disable-next-line react/no-array-index-key
              <ToolCallRow key={j} call={call} live={live} onExpand={onExpand} />
            ))}
          </Row>
        );
      })}
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
  }
}

/** File headers (`--- a/x`, `+++ b/x`) come before the first hunk; later lines are content. */
function DiffLines({ diff }: { diff: string }) {
  let inHunk = false;
  return diff
    .replace(/\n$/, '')
    .split('\n')
    .map((line, i) => {
      if (line.startsWith('@@')) inHunk = true;
      const header = !inHunk && (line.startsWith('+++ ') || line.startsWith('--- '));
      return (
        <div
          // Diff lines have no identity beyond their position.
          // oxlint-disable-next-line react/no-array-index-key
          key={i}
          className={clsx({
            'bg-success-subtle': !header && line.startsWith('+'),
            'bg-danger-subtle': !header && line.startsWith('-'),
            'text-body-secondary': header || line.startsWith('@@'),
          })}
        >
          {line || ' '}
        </div>
      );
    });
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
