import clsx from 'clsx';
import { type ComponentProps, type ReactNode, useState } from 'react';
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
  /** Controls whether the tooltip is open. Leave undefined for hover/focus behavior. */
  isOpen?: ComponentProps<typeof AriaTooltipTrigger>['isOpen'];
  /** Called when the tooltip opens or closes. */
  onOpenChange?: ComponentProps<typeof AriaTooltipTrigger>['onOpenChange'];
  placement?: AriaTooltipProps['placement'];
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
  isOpen,
  onOpenChange,
  placement = 'top',
}: TooltipProps) {
  const [triggerIsOpen, setTriggerIsOpen] = useState(false);

  const handleOpenChange = (open: boolean) => {
    setTriggerIsOpen(open);
    onOpenChange?.(open);
  };

  return (
    <AriaTooltipTrigger delay={0} isOpen={isOpen ?? triggerIsOpen} onOpenChange={handleOpenChange}>
      <Focusable>{children}</Focusable>
      <AriaTooltip
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
