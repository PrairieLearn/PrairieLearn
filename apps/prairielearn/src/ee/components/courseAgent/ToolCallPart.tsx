import clsx from 'clsx';
import { type ReactNode, useId, useState } from 'react';
import { Spinner } from 'react-bootstrap';

import type { Clip, ToolCall } from '@prairielearn/course-agent-types';
import { formatInterval } from '@prairielearn/formatter';

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
  webSearch: 'bi-globe',
  other: 'bi-gear',
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

/** A label built only from the call's own fields, so new tools need no copy of their own. */
function describe(call: ToolCall): { verb?: Verb; subject: ReactNode; meta?: string } {
  switch (call.kind) {
    case 'command': {
      const actions = call.actions;
      if (actions.length > 0 && actions.every((action) => action.type === 'read')) {
        return {
          verb: 'read',
          subject: actions.map((action, i) => (
            // A command may read the same file twice.
            // oxlint-disable-next-line react/no-array-index-key
            <span key={i}>
              {i > 0 && ', '}
              <FileName path={action.path} />
            </span>
          )),
        };
      }
      const [action] = actions;
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
      const added = call.changes.reduce((sum, change) => sum + change.added, 0);
      const removed = call.changes.reduce((sum, change) => sum + change.removed, 0);
      const meta = call.changes.length > 0 ? `+${added} −${removed}` : undefined;
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
      return {
        verb: 'call',
        subject: <Code>{call.server ? `${call.server}.${call.tool}` : call.tool}</Code>,
      };
    case 'webSearch':
      if (call.action === 'openPage' && call.target) {
        return { verb: 'read', subject: <Code>{call.target}</Code> };
      }
      return { verb: 'search', subject: call.query ? <Code>{call.query}</Code> : 'the web' };
    case 'other': {
      // Codex's item type, e.g. `imageView` as "Image view"; no verb fits every type.
      const words = call.itemType.replaceAll(/([a-z])([A-Z])/g, '$1 $2').toLowerCase();
      return {
        subject: (
          <>
            {words.charAt(0).toUpperCase() + words.slice(1)}
            {call.path && (
              <>
                {' '}
                <FileName path={call.path} />
              </>
            )}
          </>
        ),
      };
    }
  }
}

function statusNote(call: ToolCall, status: ToolCall['status']) {
  if (status === 'interrupted') return { text: 'Interrupted', failed: false };
  if (status === 'declined') return { text: 'Declined', failed: true };
  if (call.kind === 'command' && call.exitCode !== null && call.exitCode !== 0) {
    return { text: `Exit ${call.exitCode}`, failed: true };
  }
  return status === 'failed' ? { text: 'Failed', failed: true } : null;
}

function hasDetails(call: ToolCall) {
  switch (call.kind) {
    case 'command':
    case 'fileChange':
      return true;
    case 'tool':
      return !!(call.arguments.text || call.arguments.omitted || call.output || call.error);
    default:
      return false;
  }
}

/** One collapsed line per tool call; output, diffs, and arguments are shown on request. */
export function ToolCallPart({
  call,
  live,
  onExpand,
}: {
  call: ToolCall;
  /** Whether the call's message is still streaming; otherwise a running call was cut off. */
  live: boolean;
  /** Called before the details open, which makes the chat taller. */
  onExpand?: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const detailsId = useId();
  const status = call.status === 'running' && !live ? 'interrupted' : call.status;
  const running = status === 'running';
  const { verb, subject, meta } = describe(call);
  const note = statusNote(call, status);
  const expandable = hasDetails(call);

  const summary = (
    <>
      {running ? (
        <Spinner animation="border" size="sm" className="flex-shrink-0" aria-hidden="true" />
      ) : (
        <i
          className={clsx('bi flex-shrink-0', ICONS[call.kind], note?.failed && 'text-danger')}
          aria-hidden="true"
        />
      )}
      <span className="text-truncate">
        {verb && `${VERBS[verb][running ? 0 : 1]} `}
        {subject}
      </span>
      {/* The spaces separate words in the button's accessible name; flex layout drops them. */}
      {meta && <span className="flex-shrink-0 text-body-secondary"> {meta}</span>}
      {running && <span className="visually-hidden"> (in progress)</span>}
      {note && (
        <span className={clsx('flex-shrink-0 fw-semibold', note.failed && 'text-danger')}>
          {' '}
          {note.text}
        </span>
      )}
      {expandable && (
        <i
          className={clsx(
            'bi small ms-auto flex-shrink-0',
            expanded ? 'bi-chevron-down' : 'bi-chevron-right',
          )}
          aria-hidden="true"
        />
      )}
    </>
  );
  const rowClass = 'd-flex align-items-center gap-2 small text-body-secondary w-100 text-start';

  return (
    <div>
      {expandable ? (
        <button
          type="button"
          className={clsx(rowClass, 'btn btn-link p-0 text-decoration-none')}
          aria-expanded={expanded}
          aria-controls={detailsId}
          onClick={() => {
            if (!expanded) onExpand?.();
            setExpanded(!expanded);
          }}
        >
          {summary}
        </button>
      ) : (
        <div className={rowClass}>{summary}</div>
      )}
      {expanded && (
        <div id={detailsId} className="d-flex flex-column gap-2 mt-1 mb-2 ms-4">
          <ToolCallDetails call={call} />
          {call.durationMs !== null && call.durationMs >= 1000 && (
            <div className="small text-body-secondary">
              Took {formatInterval(call.durationMs, { fullPartNames: true })}
            </div>
          )}
        </div>
      )}
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
              {change.diff.text ? (
                <Output label={`Changes to ${change.path}`} clip={change.diff}>
                  <DiffLines diff={change.diff.text} />
                </Output>
              ) : (
                <ClipNote clip={change.diff} />
              )}
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
          {call.arguments.text ? (
            <Output label="Arguments" clip={call.arguments}>
              {call.arguments.text}
            </Output>
          ) : (
            <ClipNote clip={call.arguments} />
          )}
          {call.output && (
            <Output label="Result" clip={call.output}>
              {call.output.text}
            </Output>
          )}
          {call.error && <div className="small text-danger">{call.error}</div>}
        </>
      );
    default:
      return null;
  }
}

/** File headers (`--- a/x`, `+++ b/x`) come before the first hunk; later lines are content. */
function DiffLines({ diff }: { diff: string }) {
  let inHunk = false;
  return diff.split('\n').map((line, i) => {
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

/** History keeps the start and end of long text, or none of it once a message is too large. */
function ClipNote({ clip }: { clip: Clip | null }) {
  if (!clip || clip.omitted === 0) return null;
  return (
    <div className="small text-body-secondary">
      {clip.text
        ? `${clip.omitted.toLocaleString()} characters not shown`
        : `Not kept in this conversation (${clip.omitted.toLocaleString()} characters)`}
    </div>
  );
}

/** A scrollable, keyboard-focusable block of text. */
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
      <ClipNote clip={clip} />
    </div>
  );
}
