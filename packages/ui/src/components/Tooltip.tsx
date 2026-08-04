import clsx from 'clsx';
import { type ComponentProps, type ReactNode } from 'react';
import {
  Tooltip as AriaTooltip,
  type TooltipProps as AriaTooltipProps,
  TooltipTrigger as AriaTooltipTrigger,
  Focusable,
  OverlayArrow,
} from 'react-aria-components';

export interface TooltipProps {
  /** The focusable element described by the tooltip. */
  children: ComponentProps<typeof Focusable>['children'];
  /** The tooltip content. Tooltips must not contain interactive content. */
  content: ReactNode;
  /** Optional stable ID for the tooltip. React Aria generates one when omitted. */
  id?: string;
  placement?: AriaTooltipProps['placement'];
}

/**
 * An accessible tooltip built on React Aria.
 *
 * React Aria manages the trigger, positioning, screen-reader relationship,
 * Escape dismissal, and hover retention required by WCAG 2.1 success
 * criterion 1.4.13.
 */
export function Tooltip({ children, content, id, placement = 'top' }: TooltipProps) {
  const tooltipIdProps = id ? { id } : {};

  return (
    <AriaTooltipTrigger delay={0}>
      <Focusable>{children}</Focusable>
      <AriaTooltip
        {...tooltipIdProps}
        className={({ placement: actualPlacement, isEntering, isExiting }) =>
          clsx('tooltip fade', {
            show: !isEntering && !isExiting,
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
