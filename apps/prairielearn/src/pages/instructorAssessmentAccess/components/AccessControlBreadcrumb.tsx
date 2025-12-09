import type { AccessControlView } from './types.js';

interface AccessControlBreadcrumbProps {
  currentView: AccessControlView;
  /** Get the display name for an override by index */
  getOverrideName: (index: number) => string;
  onNavigate: (view: AccessControlView) => void;
}

export function AccessControlBreadcrumb({
  currentView,
  getOverrideName,
  onNavigate,
}: AccessControlBreadcrumbProps) {
  const goToSummary = () => onNavigate({ type: 'summary' });

  // Determine the current page name for the breadcrumb
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
    <nav aria-label="breadcrumb" class="mb-3">
      <ol class="breadcrumb mb-0">
        {currentView.type === 'summary' ? (
          <li class="breadcrumb-item active" aria-current="page">
            Access rules
          </li>
        ) : (
          <>
            <li class="breadcrumb-item">
              <button
                type="button"
                class="btn btn-link"
                onClick={(e) => {
                  e.preventDefault();
                  goToSummary();
                }}
              >
                Access rules
              </button>
            </li>
            <li class="breadcrumb-item active" aria-current="page">
              {getCurrentPageName()}
            </li>
          </>
        )}
      </ol>
    </nav>
  );
}
