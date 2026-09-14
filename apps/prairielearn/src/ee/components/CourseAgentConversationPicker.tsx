import { Button, Dropdown, Spinner } from 'react-bootstrap';

import type { createCourseTrpcClient } from '../../trpc/course/client.js';

type Conversation = Awaited<
  ReturnType<ReturnType<typeof createCourseTrpcClient>['courseAgent']['list']['query']>
>['conversations'][number];

export function CourseAgentConversationPicker({
  conversations,
  selectedId,
  busy,
  disabled,
  onSelect,
}: {
  conversations: Conversation[];
  selectedId: string;
  busy: boolean;
  disabled: boolean;
  onSelect: (id: string) => void;
}) {
  const selected = conversations.find((item) => item.id === selectedId);
  return (
    <div className="d-flex align-items-center gap-2">
      <Dropdown className="flex-grow-1" style={{ minWidth: 0 }}>
        <Dropdown.Toggle
          variant="light"
          className="border bg-white w-100 d-flex justify-content-between align-items-center gap-2"
          aria-label="Conversation"
          data-conversation-id={selectedId}
          disabled={disabled}
        >
          <span
            className="course-agent-conversation-selected flex-grow-1 text-start text-truncate"
            title={selected?.title ?? 'New conversation'}
          >
            {selected?.title ?? 'New conversation'}
          </span>
        </Dropdown.Toggle>
        <Dropdown.Menu className="course-agent-conversation-menu w-100 shadow-sm" role="menu">
          {conversations.length === 0 && (
            <Dropdown.ItemText className="small text-muted">No conversations yet</Dropdown.ItemText>
          )}
          {conversations.map((item) => (
            <Dropdown.Item
              key={item.id}
              as="button"
              role="menuitemradio"
              aria-checked={item.id === selectedId}
              active={item.id === selectedId}
              className="d-flex align-items-center gap-2 py-2"
              onClick={() => onSelect(item.id)}
            >
              <span className="d-flex flex-column flex-grow-1 text-start" style={{ minWidth: 0 }}>
                <span className="text-wrap text-break">{item.title}</span>
                <time className="small opacity-75" dateTime={item.last_message_at.toISOString()}>
                  {item.lastMessageAtLabel}
                </time>
              </span>
              {(item.id === selectedId
                ? busy
                : ['starting', 'running'].includes(item.runtime_status)) && (
                <Spinner
                  size="sm"
                  className="ms-auto flex-shrink-0"
                  aria-label="Conversation in progress"
                />
              )}
            </Dropdown.Item>
          ))}
        </Dropdown.Menu>
      </Dropdown>
      <Button
        size="sm"
        variant="light"
        className="flex-shrink-0"
        aria-label="New conversation"
        title="New conversation"
        disabled={disabled}
        onClick={() => onSelect('new')}
      >
        <i className="bi bi-plus-lg" aria-hidden="true" />
      </Button>
    </div>
  );
}
