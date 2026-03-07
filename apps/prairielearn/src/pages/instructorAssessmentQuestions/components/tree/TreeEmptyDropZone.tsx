export function TreeEmptyDropZone({ dropRef }: { dropRef: (node: HTMLElement | null) => void }) {
  return (
    <div
      ref={dropRef}
      className="bg-warning-subtle"
      style={{ padding: '1rem', textAlign: 'center' }}
    >
      <i className="bi bi-exclamation-triangle text-warning me-2" aria-hidden="true" />
      This zone has no questions. Add questions or delete this zone before saving.
    </div>
  );
}
