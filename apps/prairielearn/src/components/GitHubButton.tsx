import { html } from '@prairielearn/html';
import { Button } from 'react-bootstrap';

export function GitHubButtonHtml(gitHubLink: string | null) {
  if (gitHubLink == null) {
    return '';
  }

  return html`
    <a
      class="btn btn-sm btn-light d-inline-flex align-items-center gap-2"
      target="_blank"
      rel="noreferrer"
      aria-label="View on GitHub"
      href="${gitHubLink}"
    >
      <i class="bi bi-github"></i>
      <span class="d-none d-sm-inline">View on GitHub</span>
    </a>
  `;
}

export function GitHubButton({ gitHubLink }: { gitHubLink: string | null }) {
  if (!gitHubLink) return null;
  return (
    <Button
      as="a"
      size="sm"
      variant="light"
      href={gitHubLink}
      target="_blank"
      rel="noreferrer"
      aria-label="View on GitHub"
    >
      <i class="bi bi-github" /> <span class="d-none d-sm-inline">View on GitHub</span>
    </Button>
  );
}
