import { useRef } from 'preact/compat';
import {
  // eslint-disable-next-line no-restricted-imports
  OverlayTrigger as BootstrapOverlayTrigger,
  type OverlayTriggerProps as BootstrapOverlayTriggerProps,
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
  ...props
}: OverlayTriggerProps) {
  const overlayBodyRef = useRef<HTMLDivElement>(null);
  const focusTrapRef = useRef<FocusTrap | null>(null);
  const triggerElementRef = useRef<HTMLElement | null>(null);

  const handleEntered = (node: HTMLElement, isAppearing: boolean) => {
    // Store the currently focused element (the trigger) before we move focus
    if (returnFocus && document.activeElement instanceof HTMLElement) {
      triggerElementRef.current = document.activeElement;
    }

    if (shouldTrapFocus && overlayBodyRef.current) {
      // Trap focus inside the overlay body
      focusTrapRef.current = trapFocus(overlayBodyRef.current);

      // Move focus to the first focusable element
      focusFirstFocusableChild(overlayBodyRef.current);
    }

    // Call the original onEntered callback if provided
    onEntered?.(node, isAppearing);
  };

  const handleExit = (node: HTMLElement) => {
    // Deactivate the focus trap
    if (focusTrapRef.current) {
      focusTrapRef.current.deactivate();
      focusTrapRef.current = null;
    }

    // Return focus to the trigger element
    if (returnFocus && triggerElementRef.current) {
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
    <Popover {...popover.props}>
      {popover.header && <Popover.Header>{popover.header}</Popover.Header>}
      <Popover.Body ref={overlayBodyRef}>{popover.body}</Popover.Body>
    </Popover>
  ) : null;

  const tooltipOverlay = tooltip ? <Tooltip {...tooltip.props}>{tooltip.body}</Tooltip> : null;

  return (
    <BootstrapOverlayTrigger
      {...props}
      overlay={popoverOverlay ?? tooltipOverlay!}
      onEntered={handleEntered}
      onExit={handleExit}
    >
      {children}
    </BootstrapOverlayTrigger>
  );
}
