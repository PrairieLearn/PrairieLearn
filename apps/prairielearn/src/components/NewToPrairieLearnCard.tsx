const DOC_LINKS = [
  {
    href: 'https://docs.prairielearn.com/question/overview/',
    label: 'How questions are structured',
  },
  {
    href: 'https://docs.prairielearn.com/elements/',
    label: 'Available elements',
  },
  {
    href: 'https://docs.prairielearn.com/question/template/',
    label: 'Writing question HTML',
  },
];

export function NewToPrairieLearnCard() {
  return (
    <div className="card bg-light text-start small">
      <div className="card-body py-2 px-3">
        <p className="fw-semibold mb-1">New to PrairieLearn?</p>
        <ul className="mb-0 ps-3">
          {DOC_LINKS.map((link) => (
            <li key={link.href}>
              <a href={link.href} target="_blank" rel="noopener noreferrer">
                {link.label}
              </a>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
