import { renderHtml } from '@prairielearn/react';

interface BreadcrumbItem {
  label: string;
  href?: string;
}

export function Breadcrumbs({ items }: { items: BreadcrumbItem[] }) {
  return (
    <nav aria-label="breadcrumb">
      <ol className="breadcrumb mb-0">
        {items.map((item, i) => {
          const isLast = i === items.length - 1;
          if (isLast || !item.href) {
            return (
              <li key={i} className="breadcrumb-item active" aria-current="page">
                {item.label}
              </li>
            );
          }
          return (
            <li key={i} className="breadcrumb-item">
              <a href={item.href}>{item.label}</a>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

export function BreadcrumbsHtml({ items }: { items: BreadcrumbItem[] }) {
  return renderHtml(<Breadcrumbs items={items} />);
}
