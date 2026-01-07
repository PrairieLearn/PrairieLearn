import { type HtmlSafeString, html } from '@prairielearn/html';

export interface BreadcrumbItem {
  label: string;
  url?: string;
}

export function Breadcrumbs({ breadcrumbs }: { breadcrumbs: BreadcrumbItem[] }): HtmlSafeString {
  return html`
    <nav aria-label="breadcrumb" class="mb-3">
      <ol class="breadcrumb mb-0">
        ${breadcrumbs.map((item, index) => {
          const isLast = index === breadcrumbs.length - 1;
          if (isLast || !item.url) {
            return html`
              <li class="breadcrumb-item active" aria-current="page">${item.label}</li>
            `;
          }
          return html`
            <li class="breadcrumb-item">
              <a href="${item.url}">${item.label}</a>
            </li>
          `;
        })}
      </ol>
    </nav>
  `;
}
