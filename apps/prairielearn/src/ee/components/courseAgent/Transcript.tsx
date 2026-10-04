/* eslint-disable @eslint-react/no-array-index-key -- Text segments and immutable diff lines keep their order within a message. */

import { type UIMessage } from 'ai';
import { type ReactNode } from 'react';

import { type ApprovalDisplay } from '@prairielearn/course-agent-contract';

import { formatCourseAgentDate } from '../../../lib/course-agent-date.js';
import { ActivityStatus } from '../ai/ActivityStatus.js';
import { ChatMessage } from '../ai/ChatMessage.js';
import { MemoizedMarkdown } from '../ai/MemoizedMarkdown.js';
import { ReasoningSummary } from '../ai/ReasoningSummary.js';

import { buildTranscript } from './message-parts.js';

export function Transcript({
  messages,
  approvals,
  renderCodeChange,
  userName,
  timezone,
}: {
  messages: UIMessage[];
  approvals: ApprovalDisplay[];
  renderCodeChange: (approval: ApprovalDisplay) => ReactNode;
  userName: string;
  timezone: string;
}) {
  return buildTranscript(messages, approvals).map((entry) =>
    entry.role === 'user' ? (
      <ChatMessage
        key={entry.id}
        messageRole="user"
        className="d-flex flex-column align-items-end mb-3"
        label={`Message from ${userName}`}
      >
        <div className="p-3 rounded bg-secondary-subtle course-agent-user-message">
          {entry.parts
            .flatMap((p) => (p.kind === 'part' && p.part.type === 'text' ? [p.part.text] : []))
            .join('\n')}
        </div>
        <div className="small text-muted px-1 mt-1">
          {userName}
          {(() => {
            const metadata = messages.find((m) => m.id === entry.id)?.metadata;
            return metadata &&
              typeof metadata === 'object' &&
              'created_at' in metadata &&
              typeof metadata.created_at === 'string' ? (
              <> · {formatCourseAgentDate(new Date(metadata.created_at), timezone, false)}</>
            ) : null;
          })()}
        </div>
      </ChatMessage>
    ) : (
      <ChatMessage key={entry.id} messageRole={entry.role}>
        {entry.parts.map((part, index) => {
          if (part.kind === 'code-change') {
            return <div key={part.approval.id}>{renderCodeChange(part.approval)}</div>;
          }
          if (part.kind === 'tools') {
            return (
              <div key={index} className="d-flex flex-column gap-2 my-2">
                {part.parts.map((tool) => {
                  const state = toolState(tool);
                  const details = toolDetails(tool);
                  if (!details) {
                    return (
                      <div
                        key={'toolCallId' in tool ? String(tool.toolCallId) : index}
                        className="course-agent-tool-empty"
                      >
                        <ActivityStatus state={state} statusText={toolTitle(tool)} />
                      </div>
                    );
                  }
                  return (
                    <details
                      key={'toolCallId' in tool ? String(tool.toolCallId) : index}
                      className="course-agent-tool"
                      open={state === 'error'}
                    >
                      <summary>
                        <ActivityStatus state={state} statusText={toolTitle(tool)} />
                      </summary>
                      <pre className="small mt-2 mb-0 p-2 bg-body border rounded">{details}</pre>
                    </details>
                  );
                })}
              </div>
            );
          }
          const value = part.part;
          if (value.type === 'text') return <MemoizedMarkdown key={index} content={value.text} />;
          if (value.type === 'reasoning') {
            return (
              <div key={index} className="mb-2">
                <ReasoningSummary text={value.text} state={value.state} />
              </div>
            );
          }
          return null;
        })}
      </ChatMessage>
    ),
  );
}

function toolState(part: UIMessage['parts'][number]): 'streaming' | 'success' | 'error' {
  if ('state' in part && part.state === 'output-error') return 'error';
  if (!('state' in part) || part.state !== 'output-available') return 'streaming';
  const output = 'output' in part ? part.output : undefined;
  if (
    output &&
    typeof output === 'object' &&
    (('exitCode' in output && typeof output.exitCode === 'number' && output.exitCode !== 0) ||
      ('status' in output && output.status === 'failed'))
  ) {
    return 'error';
  }
  return 'success';
}

function toolTitle(part: UIMessage['parts'][number]) {
  const running = toolState(part) === 'streaming';
  const name = 'toolName' in part ? String(part.toolName) : part.type.replace(/^tool-/, '');
  if (name === 'push_sync') return 'Code change request';
  if (name === 'command_execution') {
    const input = 'input' in part ? part.input : undefined;
    const command =
      input && typeof input === 'object' && 'command' in input ? String(input.command) : '';
    if (command) return `${running ? 'Running' : 'Command'}: ${command}`;
    return running ? 'Running command…' : 'Ran command';
  }
  if (name === 'file_change') return running ? 'Editing files…' : 'Edited files';
  return name.replaceAll('_', ' ');
}

function toolDetails(part: UIMessage['parts'][number]) {
  const input = 'input' in part ? part.input : undefined;
  const output = 'output' in part ? part.output : undefined;
  if (input && typeof input === 'object' && 'command' in input) {
    const text = output && typeof output === 'object' && 'output' in output ? output.output : '';
    return `${String(input.command)}\n${String(text ?? '')}`;
  }
  if ('errorText' in part) return String(part.errorText);
  const value = output ?? input;
  return value == null || (typeof value === 'object' && Object.keys(value).length === 0)
    ? ''
    : JSON.stringify(value, null, 2);
}
