import clsx from 'clsx';
import { Dropdown } from 'react-bootstrap';

export function ViewSwitcherDropdown({
  currentView,
  switchViewUrl,
  editMode = false,
  className,
  toggleClassName,
}: {
  currentView: 'new' | 'classic';
  switchViewUrl: string | null;
  editMode?: boolean;
  className?: string;
  toggleClassName?: string;
}) {
  if (!switchViewUrl) return null;

  const showSwitchItem = !editMode;

  return (
    <Dropdown className={className}>
      <Dropdown.Toggle
        variant="link"
        size="sm"
        className={clsx('text-decoration-none', toggleClassName)}
      >
        <span className={clsx('badge', currentView === 'new' ? 'color-green1' : 'color-yellow1')}>
          {currentView === 'new' ? 'New' : 'Classic'}
        </span>
      </Dropdown.Toggle>
      <Dropdown.Menu>
        <Dropdown.Item
          href="https://github.com/PrairieLearn/PrairieLearn/discussions/14353"
          target="_blank"
          rel="noopener noreferrer"
        >
          Give feedback <i className="bi bi-box-arrow-up-right ms-1" aria-hidden="true" />
        </Dropdown.Item>
        {showSwitchItem && (
          <>
            <Dropdown.Divider />
            <Dropdown.Item href={switchViewUrl}>
              Switch to {currentView === 'new' ? 'classic' : 'new'} experience
            </Dropdown.Item>
          </>
        )}
      </Dropdown.Menu>
    </Dropdown>
  );
}
