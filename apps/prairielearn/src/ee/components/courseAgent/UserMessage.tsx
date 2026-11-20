import clsx from 'clsx';

export function UserMessage({
  text,
  entering = false,
}: {
  text: string;
  /** Just sent, so it rises into the chat. */
  entering?: boolean;
}) {
  return (
    <div
      className={clsx(
        'align-self-end course-agent-user-message bg-body-secondary rounded-3 px-3 py-2',
        entering && 'course-agent-rise',
      )}
    >
      {text}
    </div>
  );
}
