import clsx from 'clsx';
import { type DOMAttributes, type ReactElement, type ReactNode } from 'react';
import {
  Tooltip as AriaTooltip,
  type TooltipProps as AriaTooltipProps,
  TooltipTrigger as AriaTooltipTrigger,
  Focusable,
  OverlayArrow,
} from 'react-aria-components';

export interface TooltipProps {
  /** The focusable element described by the tooltip. */
  children: ReactElement;
  /** The tooltip content. Tooltips must not contain interactive content. */
  content: ReactNode;
  /** Optional stable ID for the tooltip. React Aria generates one when omitted. */
  id?: string;
  placement?: AriaTooltipProps['placement'];
  /** Delay before opening from hover. Focus opens the tooltip immediately. */
  delay?: number;
  /** Delay before closing, which allows the pointer to move onto the tooltip. */
  closeDelay?: number;
  /** Whether the tooltip opens on focus only, or on both hover and focus. */
  trigger?: 'hover' | 'focus';
  isDisabled?: boolean;
  shouldCloseOnPress?: boolean;
}

/**
 * An accessible tooltip built on React Aria.
 *
 * React Aria manages the trigger, positioning, screen-reader relationship,
 * Escape dismissal, and hover retention required by WCAG 2.1 success
 * criterion 1.4.13.
 */
export function Tooltip({
  children,
  content,
  id,
  placement = 'top',
  delay = 0,
  closeDelay = 500,
  trigger = 'hover',
  isDisabled,
  shouldCloseOnPress = true,
}: TooltipProps) {
  const tooltipIdProps = id ? { id } : {};

  return (
    <AriaTooltipTrigger
      delay={delay}
      closeDelay={closeDelay}
      trigger={trigger}
      isDisabled={isDisabled}
      shouldCloseOnPress={shouldCloseOnPress}
    >
      <Focusable>{children as ReactElement<DOMAttributes<HTMLElement>, string>}</Focusable>
      <AriaTooltip
        {...tooltipIdProps}
        className={({ placement: actualPlacement }) =>
          clsx('tooltip', 'show', {
            'bs-tooltip-top': actualPlacement === 'top',
            'bs-tooltip-end': actualPlacement === 'right',
            'bs-tooltip-bottom': actualPlacement === 'bottom',
            'bs-tooltip-start': actualPlacement === 'left',
          })
        }
        placement={placement}
        offset={6}
      >
        <OverlayArrow className="tooltip-arrow" />
        <div className="tooltip-inner">{content}</div>
      </AriaTooltip>
    </AriaTooltipTrigger>
  );
}
