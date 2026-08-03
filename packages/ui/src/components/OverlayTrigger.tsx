import { useEffect, useRef } from 'react';
import {
  // eslint-disable-next-line no-restricted-imports
  OverlayTrigger as BootstrapOverlayTrigger,
  type OverlayTriggerProps as BootstrapOverlayTriggerProps,
  Popover,
  type PopoverProps,
  type TooltipProps,
} from 'react-bootstrap';

import { type FocusTrap, focusFirstFocusableChild, trapFocus } from '@prairielearn/browser-utils';

import { Tooltip as AriaTooltip, type TooltipProps as AriaTooltipProps } from './Tooltip.js';

function getAriaTooltipPlacement(
  placement: BootstrapOverlayTriggerProps['placement'],
): AriaTooltipProps['placement'] {
  if (typeof placement !== 'string' || placement === 'auto') return 'top';
  if (placement === 'auto-start') return 'top start';
  if (placement === 'auto-end') return 'top end';
  if (placement === 'left-start') return 'left top';
  if (placement === 'left-end') return 'left bottom';
  if (placement === 'right-start') return 'right top';
  if (placement === 'right-end') return 'right bottom';
  return placement.replace('-', ' ') as AriaTooltipProps['placement'];
}

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
     *
     * @deprecated Use the React Aria-based `Tooltip` component directly for new code.
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
 * handling the Popover construction and ref management internally. Its legacy
 * tooltip API delegates to the React Aria-based Tooltip component for backwards
 * compatibility; new tooltip call sites should use Tooltip directly.
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

    const isClickTriggered = Array.isArray(props.trigger)
      ? props.trigger.includes('click')
      : props.trigger === 'click';
    if (shouldTrapFocus && overlayBodyRef.current && isClickTriggered) {
      // Trap focus inside the overlay body
      focusTrapRef.current = trapFocus(overlayBodyRef.current);

      // Move focus to the first focusable element
      focusFirstFocusableChild(overlayBodyRef.current);
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
    const isClickTriggered = Array.isArray(props.trigger)
      ? props.trigger.includes('click')
      : props.trigger === 'click';
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

  if (tooltip) {
    if (typeof children === 'function') {
      throw new Error('Tooltip children must be a focusable element');
    }

    const isClickTriggered = Array.isArray(props.trigger)
      ? props.trigger.includes('click')
      : props.trigger === 'click';
    if (isClickTriggered) {
      throw new Error('Use a popover for content that opens on click');
    }

    const delay = typeof props.delay === 'number' ? props.delay : props.delay?.show;
    const closeDelay = typeof props.delay === 'number' ? props.delay : props.delay?.hide;
    const trigger =
      props.trigger === 'focus' ||
      (Array.isArray(props.trigger) &&
        props.trigger.includes('focus') &&
        !props.trigger.includes('hover'))
        ? 'focus'
        : 'hover';

    return (
      <AriaTooltip
        id={tooltip.props.id}
        content={tooltip.body}
        placement={getAriaTooltipPlacement(props.placement)}
        delay={delay}
        closeDelay={closeDelay}
        trigger={trigger}
      >
        {children}
      </AriaTooltip>
    );
  }

  // Construct the popover with our managed ref
  const popoverOverlay = popover ? (
    <Popover {...popover.props}>
      {popover.header && <Popover.Header>{popover.header}</Popover.Header>}
      <Popover.Body ref={overlayBodyRef}>{popover.body}</Popover.Body>
    </Popover>
  ) : null;

  return (
    <BootstrapOverlayTrigger
      {...props}
      overlay={popoverOverlay!}
      onEntered={handleEntered}
      onExit={handleExit}
    >
      {children}
    </BootstrapOverlayTrigger>
  );
}
