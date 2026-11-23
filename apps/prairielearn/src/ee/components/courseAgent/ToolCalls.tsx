import type { ReasoningUIPart, TextUIPart } from 'ai';
import clsx from 'clsx';
import { type ReactNode, useEffect, useId, useState } from 'react';
import type { UrlTransform } from 'react-markdown';

import type { Clip, ToolCall } from '@prairielearn/course-agent-types';

import { ChatMarkdown } from '../ai/ChatMarkdown.js';

/**
 * One thing the agent did on the way to its reply: a tool call, reasoning between calls, or an
 * update it wrote along the way.
 */
export type WorkItem = ToolCall | ReasoningUIPart | TextUIPart;

const isCall = (item: WorkItem): item is ToolCall => 'kind' in item;

/** Where the sandbox keeps the agent's skills, which staff cannot see. */
const SKILLS_DIR = '/etc/codex/skills/';

/** The agent's own tools for students' results. */
const isCourseData = (call: ToolCall) =>
  call.kind === 'tool' &&
  call.server === null &&
  ['list_course_datasets', 'get_course_data'].includes(call.tool);

/** Reading its skills is how the agent checks how this kind of work is done. */
const usesSkills = (call: ToolCall) => call.kind === 'command' && call.command.includes(SKILLS_DIR);

import { ChatCodeBlock, ChatDiff, preloadDiffHighlighting } from './ChatDiff.js';

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
  | 'check'
  | 'look up'
  | 'summarize';

/**
 * Finished steps are worded as instructions, as the agent words the ones it labels itself, so a
 * list of steps reads the same way throughout.
 */
const VERBS: Record<Verb, [running: string, done: string]> = {
  read: ['Reading', 'Read'],
  list: ['Looking through', 'Look through'],
  search: ['Searching', 'Search'],
  browse: ['Browsing', 'Browse'],
  run: ['Running', 'Run'],
  edit: ['Editing', 'Edit'],
  create: ['Creating', 'Create'],
  delete: ['Deleting', 'Delete'],
  call: ['Calling', 'Call'],
  check: ['Checking', 'Check'],
  'look up': ['Looking up', 'Look up'],
  summarize: ['Summarizing', 'Summarize'],
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

/** What kind of thing a call does, which decides how it is described. */
function category(call: ToolCall) {
  switch (call.kind) {
    case 'command': {
      const types = new Set(call.actions.map((action) => action.type));
      if (types.size === 1 && types.has('read')) return 'read';
      if (call.actions.length === 1 && types.has('listFiles')) return 'list';
      if (call.actions.length === 1 && types.has('search')) return 'search';
      return 'run';
    }
    case 'fileChange':
      return 'edit';
    case 'tool':
      return call.server === 'web' ? 'web' : isCourseData(call) ? 'data' : 'call';
    case 'compaction':
      return 'compaction';
  }
}

/** A label built only from the call's own fields, so new tools need no copy of their own. */
function describe(call: ToolCall): { verb: Verb; subject: ReactNode; meta?: string } {
  switch (call.kind) {
    case 'command': {
      if (usesSkills(call)) return { verb: 'check', subject: 'guidance' };
      const { actions } = call;
      const [action] = actions;
      if (category(call) === 'read') {
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
      // Staff read what a step was for; its command, query, or path is in the step's details.
      if (actions.length === 1 && action.type === 'listFiles') {
        return { verb: 'list', subject: 'the course files' };
      }
      if (actions.length === 1 && action.type === 'search') {
        return { verb: 'search', subject: 'the course files' };
      }
      return { verb: 'run', subject: 'a command' };
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
      if (isCourseData(call)) return { verb: 'look up', subject: 'course data' };
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
  const known = text.split('\n').some(Boolean);
  if (action === 'openPage' && known) return { verb: 'read', subject: 'a web page' };
  if (action === 'findInPage' && known) return { verb: 'search', subject: 'a web page' };
  if (action === 'search' && known) return { verb: 'search', subject: 'the web' };
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

/**
 * A line that opens to show more: its label, then a chevron. Steps are listed this way so they
 * read as sentences, with commands and paths one click further in.
 */
function Fold({
  label,
  running = false,
  meta,
  stopped = false,
  tail,
  className,
  onExpand,
  children,
}: {
  label: ReactNode;
  running?: boolean;
  meta?: string;
  /** The turn ended before this finished. */
  stopped?: boolean;
  /** Shown under the closed line; the details take its place while the line is open. */
  tail?: ReactNode;
  className?: string;
  onExpand?: () => void;
  children: ReactNode;
}) {
  const [expanded, setExpanded] = useState(false);
  const detailsId = useId();
  return (
    <div className={className}>
      <button
        type="button"
        className="course-agent-fold btn btn-link p-0 border-0 d-flex align-items-center gap-1 mw-100 text-start text-decoration-none text-body-secondary"
        aria-expanded={expanded}
        aria-controls={detailsId}
        onClick={() => {
          if (!expanded) onExpand?.();
          setExpanded(!expanded);
        }}
      >
        <span className={clsx('text-truncate', running && 'course-agent-shimmer')}>{label}</span>
        {/* The spaces separate words in the button's accessible name; flex layout drops them. */}
        {meta && <span className="flex-shrink-0"> {meta}</span>}
        {running && <span className="visually-hidden"> (in progress)</span>}
        {stopped && <span className="flex-shrink-0 fw-semibold"> Stopped</span>}
        <i
          className={clsx(
            'bi small flex-shrink-0',
            expanded ? 'bi-chevron-down' : 'bi-chevron-right',
          )}
          aria-hidden="true"
        />
      </button>
      {expanded && <div id={detailsId}>{children}</div>}
      {/* Hidden, not removed, while the line is open: putting it back would fade it in again. */}
      {tail && <div hidden={expanded}>{tail}</div>}
    </div>
  );
}

/** The end of a running command's output, so a long command shows that it is getting somewhere. */
export function LiveOutput({ call }: { call: ToolCall }) {
  if (call.kind !== 'command' || !call.output?.text.trim()) return null;
  // A progress bar rewrites its line; only the last rewrite is on screen.
  const line = call.output.text.trimEnd().split('\n').at(-1)?.split('\r').at(-1);
  return (
    <pre className="course-agent-live-output text-body-secondary mb-0 mt-1" aria-hidden="true">
      {line}
    </pre>
  );
}

/**
 * The agent starts each command with a comment saying what it does, which is what staff read in
 * place of the command.
 */
function commandNote(call: ToolCall) {
  if (call.kind !== 'command') return null;
  const [first] = unwrapShell(call.command)
    // A script that could not be unwrapped still starts after the shell and its opening quote.
    .replace(/^(?:\S*\/)?(?:ba|z)?sh -l?c ["']?/, '')
    .split('\n');
  return /^#(?!!)\s*(.+)$/.exec(first.trim())?.[1] ?? null;
}

/**
 * What a running call is doing, for the chat's status line. Many staff are not technical, so it
 * names files but never shows a command.
 */
export function runningLabel(call: ToolCall): string {
  const name = (path: string) => path.split('/').at(-1);
  switch (call.kind) {
    case 'command': {
      const note = commandNote(call);
      if (note) return note;
      if (usesSkills(call)) return 'Checking guidance';
      const kind = category(call);
      if (kind === 'read') {
        const paths = call.actions.flatMap((action) =>
          action.type === 'read' ? [action.path] : [],
        );
        return paths.length === 1 ? `Reading ${name(paths[0])}` : `Reading ${paths.length} files`;
      }
      if (kind === 'list') return 'Looking through the course files';
      if (kind === 'search') return 'Searching the course files';
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
      if (isCourseData(call)) return 'Looking up course data';
      if (call.server !== 'web') return 'Getting information';
      return call.tool === 'search' ? 'Searching the web' : 'Reading a web page';
    case 'compaction':
      return 'Summarizing earlier conversation';
  }
}

/**
 * What went wrong with a step, for its details. The closed line stays quiet about failures, which
 * are routine, so the details must say when a command or an edit did not go through.
 */
function failureNote(call: ToolCall) {
  if (call.kind === 'command' && call.exitCode !== null && call.exitCode !== 0) {
    return `This command ended with an error (exit code ${call.exitCode}).`;
  }
  if (call.status !== 'failed') return null;
  if (call.kind === 'fileChange') return 'These changes were not made.';
  // A failed tool call shows its own error.
  return call.kind === 'tool' && call.error ? null : 'This step failed.';
}

/** One call in the list of steps, which opens to show its command, output, or changes. */
function Step({ call, live, onExpand }: { call: ToolCall; live: boolean; onExpand?: () => void }) {
  const status = statusOf(call, live);
  const running = status === 'running';
  const { verb, subject, meta } = describe(call);
  const failure = failureNote(call);
  const editedPaths =
    call.kind === 'fileChange' ? call.changes.map((change) => change.path).join('\n') : '';
  // An edit's changes stay hidden until the row is expanded. Loading their language's highlighting
  // now means they are colored as soon as they're shown.
  useEffect(() => {
    if (editedPaths === '') return;
    // This starts a download; no data goes to a parent.
    // oxlint-disable-next-line react-you-might-not-need-an-effect/no-pass-data-to-parent
    for (const path of editedPaths.split('\n')) preloadDiffHighlighting(path);
  }, [editedPaths]);
  return (
    <Fold
      className="course-agent-step px-2 py-1"
      label={
        commandNote(call) ?? (
          <>
            {VERBS[verb][running ? 0 : 1]} {subject}
          </>
        )
      }
      running={running}
      meta={meta}
      stopped={status === 'interrupted'}
      onExpand={onExpand}
    >
      <div className="d-flex flex-column gap-1 my-1">
        {failure && <div className="small text-danger">{failure}</div>}
        <ToolCallDetails call={call} />
      </div>
    </Fold>
  );
}

/** Codex heads each section of a reasoning summary with a bold title; the latest names the topic. */
export function reasoningHeading(text: string) {
  return [...text.matchAll(/\*\*(.+?)\*\*/g)].at(-1)?.[1] ?? null;
}

/**
 * Everything the agent did before a reply, folded into one line so the chat reads as its replies.
 * Opening it shows the agent's updates and, between them, its steps as a list. Reasoning is left
 * out: the status line shows what the agent is thinking about while that matters.
 */
export function ToolCalls({
  items,
  live,
  settled,
  showUpdate,
  urlTransform,
  onExpand,
}: {
  items: WorkItem[];
  /** Whether the message is still streaming; otherwise a running call was cut off. */
  live: boolean;
  /** Whether this work is over. */
  settled: boolean;
  /** Whether to show the agent's latest update under the line while it works. */
  showUpdate: boolean;
  /** Updates link to course files as replies do. */
  urlTransform: UrlTransform;
  /** Called before a line opens, which makes the chat taller. */
  onExpand?: () => void;
}) {
  const blocks: (ToolCall[] | TextUIPart)[] = [];
  for (const item of items) {
    const last = blocks.at(-1);
    if (!isCall(item)) {
      if (item.type === 'text') blocks.push(item);
    } else if (Array.isArray(last)) {
      last.push(item);
    } else {
      blocks.push([item]);
    }
  }
  const calls = items.filter(isCall);
  const updates = blocks.filter((block): block is TextUIPart => !Array.isArray(block));
  // A new update starts out empty; the one before it stays up until there is text to replace it.
  let update: TextUIPart | undefined;
  for (const part of updates) {
    if (part.text.trim()) update = part;
  }
  // With no steps to fold away, the updates stay in view; hiding them until the turn ended would
  // have them pop back in above the reply.
  if (calls.length === 0) {
    return updates.map((part, i) => (
      // Updates only ever append to a streaming message, so their positions identify them.
      // oxlint-disable-next-line react/no-array-index-key
      <Update key={i} part={part} urlTransform={urlTransform} fadeIn={live} />
    ));
  }
  return (
    <Fold
      label={
        settled
          ? `Worked through ${count(calls.length, 'step')}`
          : `Working · ${count(calls.length, 'step')}`
      }
      // Failed steps are routine and stay in the details; a turn cut short is worth saying.
      stopped={calls.some((call) => statusOf(call, live) === 'interrupted')}
      // While it works, the agent's latest update says where it has got to.
      tail={
        !settled &&
        showUpdate &&
        update && <Update part={update} urlTransform={urlTransform} fadeIn={live} />
      }
      onExpand={onExpand}
    >
      <div className="d-flex flex-column gap-2 mt-2 mb-1">
        {blocks.map((block, i) =>
          Array.isArray(block) ? (
            // Blocks only ever append to a streaming message, so their positions identify them.
            // oxlint-disable-next-line react/no-array-index-key
            <div key={i} className="border rounded-3">
              {block.map((call, j) => (
                // oxlint-disable-next-line react/no-array-index-key
                <Step key={j} call={call} live={live} onExpand={onExpand} />
              ))}
            </div>
          ) : (
            // These exist only while the line is open, so opening it must not fade them all in.
            // oxlint-disable-next-line react/no-array-index-key
            <Update key={i} part={block} urlTransform={urlTransform} fadeIn={false} />
          ),
        )}
      </div>
    </Fold>
  );
}

/** Something the agent wrote along the way, which is not part of its reply. */
function Update({
  part,
  urlTransform,
  fadeIn,
}: {
  part: TextUIPart;
  urlTransform: UrlTransform;
  /** Whether the update is arriving in view, so its words fade in. */
  fadeIn: boolean;
}) {
  return (
    <ChatMarkdown
      className="markdown-body small text-body-secondary mt-1"
      content={part.text}
      streaming={part.state === 'streaming'}
      urlTransform={urlTransform}
      codeBlock={ChatCodeBlock}
      animated={fadeIn}
      arriving={fadeIn}
      math
    />
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
              <ChatDiff
                text={change.diff.text}
                path={change.path}
                change={FILE_CHANGES[change.change]}
              />
              <ClipNote clip={change.diff} />
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

const FILE_CHANGES = { add: 'added', delete: 'deleted', update: 'modified' } as const;

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
      <ClipNote clip={clip} />
    </div>
  );
}

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
