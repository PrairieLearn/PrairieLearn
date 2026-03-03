export function TreeEmptyDropZone({
  dropRef,
  isOver,
}: {
  dropRef: (node: HTMLElement | null) => void;
  isOver: boolean;
}) {
  return (
    <div
      ref={dropRef}
      className={isOver ? 'bg-primary-subtle' : 'bg-warning-subtle'}
      style={{ transition: 'all 0.2s ease', padding: '1rem', textAlign: 'center' }}
    >
      {isOver ? (
        <span className="text-primary">
          <i className="bi bi-plus-circle me-2" aria-hidden="true" />
          Drop here to add to this zone
        </span>
      ) : (
        <>
          <i className="bi bi-exclamation-triangle text-warning me-2" aria-hidden="true" />
          This zone has no questions. Add questions or delete this zone before saving.
        </>
      )}
    </div>
  );
}
