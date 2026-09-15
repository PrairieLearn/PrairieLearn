import clsx from 'clsx';
import { type ComponentProps, type ReactNode } from 'react';
import {
  Popover as AriaPopover,
  type PopoverProps as AriaPopoverProps,
  Dialog,
  DialogTrigger,
  Heading,
  OverlayArrow,
  Pressable,
} from 'react-aria-components';

export interface PopoverProps {
  /** The interactive element that opens the popover. */
  children: ComponentProps<typeof Pressable>['children'];
  /** The popover body. */
  content: ReactNode;
  /** An optional heading for the popover. */
  heading?: ReactNode;
  /** Controls whether the popover is open. */
  isOpen?: ComponentProps<typeof DialogTrigger>['isOpen'];
  /** Called when the popover opens or closes. */
  onOpenChange?: ComponentProps<typeof DialogTrigger>['onOpenChange'];
  placement?: AriaPopoverProps['placement'];
}

/**
 * An accessible, press-triggered popover built on React Aria and styled with Bootstrap.
 *
 * The trigger must be an interactive element that forwards its ref to the underlying DOM element.
 */
export function Popover({
  children,
  content,
  heading,
  isOpen,
  onOpenChange,
  placement = 'top',
}: PopoverProps) {
  return (
    <DialogTrigger isOpen={isOpen} onOpenChange={onOpenChange}>
      <Pressable>{children}</Pressable>
      <AriaPopover
        className={({ placement: actualPlacement, isEntering, isExiting }) =>
          clsx('popover fade', {
            show: !isEntering && !isExiting,
            'bs-popover-top': actualPlacement === 'top',
            'bs-popover-end': actualPlacement === 'right',
            'bs-popover-bottom': actualPlacement === 'bottom',
            'bs-popover-start': actualPlacement === 'left',
          })
        }
        placement={placement}
        offset={8}
      >
        <OverlayArrow className="popover-arrow" />
        <Dialog style={{ outline: 'none' }}>
          {heading && (
            <Heading slot="title" className="popover-header">
              {heading}
            </Heading>
          )}
          <div className="popover-body">{content}</div>
        </Dialog>
      </AriaPopover>
    </DialogTrigger>
  );
}
