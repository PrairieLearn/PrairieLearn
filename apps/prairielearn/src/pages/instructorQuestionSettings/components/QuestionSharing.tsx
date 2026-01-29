import type { SharingSetRow } from '../instructorQuestionSettings.types.js';

export function QuestionSharing({
  sharePublicly,
  shareSourcePublicly,
  sharingSetsIn,
}: {
  sharePublicly: boolean;
  shareSourcePublicly: boolean;
  sharingSetsIn: SharingSetRow[];
}) {
  if (!sharePublicly && !shareSourcePublicly && sharingSetsIn.length === 0) {
    return <p>This question is not being shared.</p>;
  }

  return (
    <>
      {sharePublicly && (
        <p>
          <span className="badge color-green3 me-1">Public</span>
          This question is publicly shared and can be imported by other courses.
        </p>
      )}

      {shareSourcePublicly && (
        <p>
          <span className="badge color-green3 me-1">Public source</span>
          This question's source is publicly shared.
        </p>
      )}

      {sharingSetsIn.length > 0 && (
        <p>
          Shared with{' '}
          {sharingSetsIn.length === 1 ? '1 sharing set' : `${sharingSetsIn.length} sharing sets`}:
          {sharingSetsIn.map((sharingSet) => (
            <span key={sharingSet.id} className="badge color-gray1 ms-1">
              {sharingSet.name}
            </span>
          ))}
        </p>
      )}
    </>
  );
}
