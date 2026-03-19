import clsx from 'clsx';

export function FeedbackLink({ className }: { className?: string }) {
  return (
    <a
      href="https://github.com/PrairieLearn/PrairieLearn/discussions/14353"
      target="_blank"
      rel="noopener noreferrer"
      className={clsx('btn btn-sm btn-link text-decoration-none', className)}
    >
      Give feedback <i className="bi bi-box-arrow-up-right ms-1" aria-hidden="true" />
    </a>
  );
}
