import { renderHtml } from '@prairielearn/preact';

export function GitHubButton({ gitHubLink }: { gitHubLink: string | null }) {
  if (!gitHubLink) return null;
  return (
    <a
      class="btn btn-sm btn-light d-inline-flex align-items-center gap-2"
      target="_blank"
      rel="noreferrer"
      aria-label="View on GitHub"
      href={gitHubLink}
    >
      <i class="bi bi-github" />
      <span class="d-none d-sm-inline">View on GitHub</span>
    </a>
  );
}

export function GitHubButtonHtml(gitHubLink: string | null) {
  if (gitHubLink == null) {
    return '';
  }

  return renderHtml(<GitHubButton gitHubLink={gitHubLink} />);
}
