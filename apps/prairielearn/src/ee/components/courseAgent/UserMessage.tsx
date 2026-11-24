export function UserMessage({ text }: { text: string }) {
  return (
    <div className="align-self-end course-agent-user-message bg-body-secondary rounded-3 px-3 py-2">
      {text}
    </div>
  );
}
