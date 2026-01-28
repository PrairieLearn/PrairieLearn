import type { AccessControlView } from './types.js';

/** Current page type for link-based navigation */
type CurrentPage = { type: 'summary' } | { type: 'new' } | { type: 'edit'; ruleName: string };

/** Props for callback-based navigation (used in single-page form) */
interface CallbackBreadcrumbProps {
  currentView: AccessControlView;
  getOverrideName: (index: number) => string;
  onNavigate: (view: AccessControlView) => void;
  baseUrl?: never;
  currentPage?: never;
}

/** Props for link-based navigation (used in separate pages) */
interface LinkBreadcrumbProps {
  baseUrl: string;
  currentPage: CurrentPage;
  currentView?: never;
  getOverrideName?: never;
  onNavigate?: never;
}

type AccessControlBreadcrumbProps = CallbackBreadcrumbProps | LinkBreadcrumbProps;

export function AccessControlBreadcrumb(props: AccessControlBreadcrumbProps) {
  // Link-based navigation (new separate pages)
  if ('baseUrl' in props && props.baseUrl) {
    const { baseUrl, currentPage } = props;

    const getCurrentPageName = (): string => {
      switch (currentPage.type) {
        case 'summary':
          return 'Access rules';
        case 'new':
          return 'New override';
        case 'edit':
          return currentPage.ruleName;
      }
    };

    return (
      <nav aria-label="breadcrumb" className="mb-3">
        <ol className="breadcrumb mb-0">
          {currentPage.type === 'summary' ? (
            <li className="breadcrumb-item active" aria-current="page">
              Access rules
            </li>
          ) : (
            <>
              <li className="breadcrumb-item">
                <a href={baseUrl}>Access rules</a>
              </li>
              <li className="breadcrumb-item active" aria-current="page">
                {getCurrentPageName()}
              </li>
            </>
          )}
        </ol>
      </nav>
    );
  }

  // Callback-based navigation (existing single-page form)
  // At this point we know baseUrl is not present, so these props are required
  const callbackProps = props as CallbackBreadcrumbProps;
  const { currentView, getOverrideName, onNavigate } = callbackProps;
  const goToSummary = () => onNavigate({ type: 'summary' });

  const getCurrentPageName = (): string => {
    switch (currentView.type) {
      case 'summary':
        return 'Access rules';
      case 'edit-main':
        return 'Main rule';
      case 'edit-override':
        return getOverrideName(currentView.index);
    }
  };

  return (
    <nav aria-label="breadcrumb" className="mb-3">
      <ol className="breadcrumb mb-0">
        {currentView.type === 'summary' ? (
          <li className="breadcrumb-item active" aria-current="page">
            Access rules
          </li>
        ) : (
          <>
            <li className="breadcrumb-item">
              <button
                type="button"
                className="btn btn-link p-0"
                onClick={(e) => {
                  e.preventDefault();
                  goToSummary();
                }}
              >
                Access rules
              </button>
            </li>
            <li className="breadcrumb-item active" aria-current="page">
              {getCurrentPageName()}
            </li>
          </>
        )}
      </ol>
    </nav>
  );
}
