import { cloneElement, isValidElement, useEffect, useId, useRef, useState } from 'react';
import {
  // eslint-disable-next-line no-restricted-imports
  OverlayTrigger as BootstrapOverlayTrigger,
  type OverlayTriggerProps as BootstrapOverlayTriggerProps,
  CloseButton,
  Popover,
  type PopoverProps,
  Tooltip,
  type TooltipProps,
} from 'react-bootstrap';

import { type FocusTrap, focusFirstFocusableChild, trapFocus } from '@prairielearn/browser-utils';

export interface OverlayTriggerProps extends Omit<BootstrapOverlayTriggerProps, 'overlay'> {
  popover?: {
    /**
     * Additional props to pass to the Popover component.
     */
    props?: Omit<PopoverProps, 'children'>;
    /**
     * The content to display in the popover body.
     */
    body: React.ReactNode;
    /**
     * Optional header content for the popover.
     */
    header?: React.ReactNode;
  };
  tooltip?: {
    /**
     * Additional props to pass to the Tooltip component. `id` is required for accessibility.
     */
    props: Omit<TooltipProps, 'children' | 'id'> & { id: string };
    /**
     * The content to display in the tooltip body.
     */
    body: React.ReactNode;
  };
  /**
   * Whether to trap focus inside the overlay when it's shown.
   * If true, focus will be trapped and moved to the first focusable element.
   * @default true
   */
  trapFocus?: boolean;
  /**
   * Whether to return focus to the trigger element when the overlay is hidden.
   * @default true
   */
  returnFocus?: boolean;
}

/**
 * A wrapper around react-bootstrap's OverlayTrigger that adds accessibility features:
 * - Automatic focus trapping when the overlay is shown
 * - Auto-focus on the first focusable element in the overlay
 * - Returns focus to the trigger element when the overlay is hidden
 * - Automatically constructs a Popover with proper ref management
 *
 * This component provides a simpler API than react-bootstrap's OverlayTrigger by
 * handling the Popover construction and ref management internally.
 *
 * @example
 * ```tsx
 * <OverlayTrigger
 *   tooltip={{
 *     body: 'Tooltip content',
 *     props: { id: 'tooltip-id' },
 *   }}
 *   placement="right"
 * >
 *   <button>Hover me</button>
 * </OverlayTrigger>
 * ```
 *
 * @example
 * ```tsx
 * <OverlayTrigger
 *   popover={{
 *     header: 'Popover title',
 *     body: 'Popover content',
 *   }}
 *   placement="right"
 * >
 *   <button>Click me</button>
 * </OverlayTrigger>
 * ```
 */
export function OverlayTrigger({
  children,
  popover,
  tooltip,
  trapFocus: shouldTrapFocus = true,
  returnFocus = true,
  onEntered,
  onExit,
  show,
  defaultShow,
  onToggle,
  trigger,
  ...props
}: OverlayTriggerProps) {
  const [internalShow, setInternalShow] = useState(defaultShow ?? false);
  const isClickTriggered = Array.isArray(trigger) ? trigger.includes('click') : trigger === 'click';
  const isShown = show ?? internalShow;
  const headerId = useId();
  const popoverId = useId();
  const overlayBodyRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const focusTrapRef = useRef<FocusTrap | null>(null);
  const triggerElementRef = useRef<HTMLElement | null>(null);

  const handleToggle = (nextShow: boolean) => {
    if (nextShow && returnFocus && document.activeElement instanceof HTMLElement) {
      triggerElementRef.current = document.activeElement;
    }
    if (show === undefined) setInternalShow(nextShow);
    onToggle?.(nextShow);
  };

  const handleEntered = (node: HTMLElement, isAppearing: boolean) => {
    // Store the currently focused element (the trigger) before we move focus
    if (
      returnFocus &&
      triggerElementRef.current === null &&
      document.activeElement instanceof HTMLElement
    ) {
      triggerElementRef.current = document.activeElement;
    }

    const container = overlayBodyRef.current?.closest<HTMLElement>('.popover');
    if (shouldTrapFocus && container && isClickTriggered) {
      // Include the header's Close button in the focus trap.
      focusTrapRef.current = trapFocus(container);

      // Move focus to the first focusable element
      if (overlayBodyRef.current) focusFirstFocusableChild(overlayBodyRef.current);
      if (!container.contains(document.activeElement)) closeButtonRef.current?.focus();
    }

    // Call the original onEntered callback if provided
    onEntered?.(node, isAppearing);
  };

  // Deactivate the focus trap when the component unmounts
  useEffect(() => {
    return () => {
      focusTrapRef.current?.deactivate();
    };
  }, []);

  const handleExit = (node: HTMLElement) => {
    // Deactivate the focus trap
    if (focusTrapRef.current) {
      focusTrapRef.current.deactivate();
      focusTrapRef.current = null;
    }

    // Return focus to the trigger element (only for click-triggered overlays;
    // for focus-triggered tooltips this would create an infinite loop since
    // refocusing the trigger re-shows the tooltip).
    if (returnFocus && triggerElementRef.current && isClickTriggered) {
      triggerElementRef.current.focus();
      triggerElementRef.current = null;
    }

    // Call the original onExit callback if provided
    onExit?.(node);
  };

  if (Boolean(popover) === Boolean(tooltip)) {
    throw new Error('Only one of popover or tooltip must be provided');
  }

  // Construct the popover with our managed ref
  const popoverOverlay = popover ? (
    <Popover
      {...popover.props}
      id={popover.props?.id ?? popoverId}
      {...(isClickTriggered
        ? {
            role: 'dialog' as const,
            ...(popover.header
              ? { 'aria-labelledby': headerId }
              : { 'aria-label': popover.props?.['aria-label'] ?? 'Popover' }),
          }
        : {})}
      onKeyDown={(event) => {
        popover.props?.onKeyDown?.(event);
        if (isClickTriggered && event.key === 'Escape' && !event.defaultPrevented) {
          handleToggle(false);
        }
      }}
    >
      {isClickTriggered ? (
        <Popover.Header className="d-flex align-items-center gap-2">
          {popover.header && (
            <div id={headerId} className="flex-grow-1">
              {popover.header}
            </div>
          )}
          <CloseButton
            ref={closeButtonRef}
            className="ms-auto flex-shrink-0"
            onClick={() => handleToggle(false)}
          />
        </Popover.Header>
      ) : (
        popover.header && <Popover.Header>{popover.header}</Popover.Header>
      )}
      <Popover.Body ref={overlayBodyRef}>{popover.body}</Popover.Body>
    </Popover>
  ) : null;

  const tooltipOverlay = tooltip ? <Tooltip {...tooltip.props}>{tooltip.body}</Tooltip> : null;

  let triggerChild = children;
  if (popover && isClickTriggered && isValidElement<React.HTMLAttributes<HTMLElement>>(children)) {
    // React-Bootstrap requires the original trigger element, so preserve it while adding ARIA state.
    // eslint-disable-next-line @eslint-react/no-clone-element
    triggerChild = cloneElement(children, { 'aria-haspopup': 'dialog', 'aria-expanded': isShown });
  }

  return (
    <BootstrapOverlayTrigger
      {...props}
      trigger={trigger}
      show={popover ? isShown : show}
      defaultShow={popover ? undefined : defaultShow}
      overlay={popoverOverlay ?? tooltipOverlay!}
      onToggle={popover ? handleToggle : onToggle}
      onEntered={handleEntered}
      onExit={handleExit}
    >
      {triggerChild}
    </BootstrapOverlayTrigger>
  );
}
