import Badge from 'react-bootstrap/Badge';

export function AiGradingBadge({
  model,
  label = 'AI',
  muted = false,
}: {
  model: string | null;
  label?: string;
  muted?: boolean;
}) {
  return (
    <Badge
      bg="light"
      text={muted ? 'secondary' : 'dark'}
      className="border fw-medium d-inline-flex align-items-center mw-100 align-middle"
      title={model ?? undefined}
      pill
    >
      <span className="flex-shrink-0">{label}</span>
      {model && (
        <>
          <span className="mx-1 flex-shrink-0">·</span>
          <span className="font-monospace text-truncate">{model}</span>
        </>
      )}
    </Badge>
  );
}
