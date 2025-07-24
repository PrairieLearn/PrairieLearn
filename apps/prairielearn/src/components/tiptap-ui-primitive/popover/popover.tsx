/* eslint-disable @eslint-react/dom/no-missing-button-type */
/* eslint-disable @eslint-react/no-clone-element */
import {
  FloatingFocusManager,
  FloatingPortal,
  type Placement,
  autoUpdate,
  flip,
  limitShift,
  offset,
  shift,
  useClick,
  useDismiss,
  useFloating,
  useInteractions,
  useMergeRefs,
  useRole,
} from '@floating-ui/react';
import * as React from 'react';
import '@/components/tiptap-ui-primitive/popover/popover.scss';

type PopoverContextValue = ReturnType<typeof usePopover> & {
  setLabelId: (id: string | undefined) => void;
  setDescriptionId: (id: string | undefined) => void;
  updatePosition: (
    side: 'top' | 'right' | 'bottom' | 'left',
    align: 'start' | 'center' | 'end',
    sideOffset?: number,
    alignOffset?: number,
  ) => void;
};

interface PopoverOptions {
  initialOpen?: boolean;
  modal?: boolean;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  side?: 'top' | 'right' | 'bottom' | 'left';
  align?: 'start' | 'center' | 'end';
  sideOffset?: number;
  alignOffset?: number;
}

interface PopoverProps extends PopoverOptions {
  children: React.ReactNode;
}

const PopoverContext = React.createContext<PopoverContextValue | null>(null);

function usePopoverContext() {
  const context = React.useContext(PopoverContext);
  if (!context) {
    throw new Error('Popover components must be wrapped in <Popover />');
  }
  return context;
}

function usePopover({
  initialOpen = false,
  modal,
  open: controlledOpen,
  onOpenChange: setControlledOpen,
  side = 'bottom',
  align = 'center',
  sideOffset = 4,
  alignOffset = 0,
}: PopoverOptions = {}) {
  const [uncontrolledOpen, setUncontrolledOpen] = React.useState(initialOpen);
  const [labelId, setLabelId] = React.useState<string>();
  const [descriptionId, setDescriptionId] = React.useState<string>();
  const [currentPlacement, setCurrentPlacement] = React.useState<Placement>(
    `${side}-${align}` as Placement,
  );
  const [offsets, setOffsets] = React.useState({ sideOffset, alignOffset });

  const open = controlledOpen ?? uncontrolledOpen;
  const setOpen = setControlledOpen ?? setUncontrolledOpen;

  const middleware = React.useMemo(
    () => [
      offset({
        mainAxis: offsets.sideOffset,
        crossAxis: offsets.alignOffset,
      }),
      flip({
        fallbackAxisSideDirection: 'end',
        crossAxis: false,
      }),
      shift({
        limiter: limitShift({ offset: offsets.sideOffset }),
      }),
    ],
    [offsets.sideOffset, offsets.alignOffset],
  );

  const floating = useFloating({
    placement: currentPlacement,
    open,
    onOpenChange: setOpen,
    whileElementsMounted: autoUpdate,
    middleware,
  });

  const interactions = useInteractions([
    useClick(floating.context),
    useDismiss(floating.context),
    useRole(floating.context),
  ]);

  const updatePosition = React.useCallback(
    (
      newSide: 'top' | 'right' | 'bottom' | 'left',
      newAlign: 'start' | 'center' | 'end',
      newSideOffset?: number,
      newAlignOffset?: number,
    ) => {
      setCurrentPlacement(`${newSide}-${newAlign}` as Placement);
      if (newSideOffset !== undefined || newAlignOffset !== undefined) {
        setOffsets({
          sideOffset: newSideOffset ?? offsets.sideOffset,
          alignOffset: newAlignOffset ?? offsets.alignOffset,
        });
      }
    },
    [offsets.sideOffset, offsets.alignOffset],
  );

  return React.useMemo(
    () => ({
      open,
      setOpen,
      ...interactions,
      ...floating,
      modal,
      labelId,
      descriptionId,
      setLabelId,
      setDescriptionId,
      updatePosition,
    }),
    [open, setOpen, interactions, floating, modal, labelId, descriptionId, updatePosition],
  );
}

function Popover({ children, modal = false, ...options }: PopoverProps) {
  const popover = usePopover({ modal, ...options });
  return <PopoverContext.Provider value={popover}>{children}</PopoverContext.Provider>;
}

interface TriggerElementProps extends React.HTMLProps<HTMLElement> {
  asChild?: boolean;
}

const PopoverTrigger = React.forwardRef<HTMLElement, TriggerElementProps>(function PopoverTrigger(
  { children, asChild = false, ...props },
  propRef,
) {
  const context = usePopoverContext();
  const childrenRef = React.isValidElement(children)
    ? parseInt(React.version, 10) >= 19
      ? (children.props as any).ref
      : (children as any).ref
    : undefined;
  const ref = useMergeRefs([context.refs.setReference, propRef, childrenRef]);

  if (asChild && React.isValidElement(children)) {
    return React.cloneElement(
      children,
      context.getReferenceProps({
        ref,
        ...props,
        ...(children.props as any),
        'data-state': context.open ? 'open' : 'closed',
      }),
    );
  }

  return (
    <button
      ref={ref}
      data-state={context.open ? 'open' : 'closed'}
      {...context.getReferenceProps(props)}
    >
      {children}
    </button>
  );
});

interface PopoverContentProps extends React.HTMLProps<HTMLDivElement> {
  side?: 'top' | 'right' | 'bottom' | 'left';
  align?: 'start' | 'center' | 'end';
  sideOffset?: number;
  alignOffset?: number;
  portal?: boolean;
  portalProps?: Omit<React.ComponentProps<typeof FloatingPortal>, 'children'>;
  asChild?: boolean;
}

const DEFAULT_PORTAL_PROPS = {};
const PopoverContent = React.forwardRef<HTMLDivElement, PopoverContentProps>(
  function PopoverContent(
    {
      className,
      side = 'bottom',
      align = 'center',
      sideOffset,
      alignOffset,
      style,
      portal = true,
      portalProps = DEFAULT_PORTAL_PROPS,
      asChild = false,
      children,
      ...props
    },
    propRef,
  ) {
    const context = usePopoverContext();
    const childrenRef = React.isValidElement(children)
      ? parseInt(React.version, 10) >= 19
        ? (children.props as any).ref
        : (children as any).ref
      : undefined;
    const ref = useMergeRefs([context.refs.setFloating, propRef, childrenRef]);

    React.useEffect(() => {
      context.updatePosition(side, align, sideOffset, alignOffset);
    }, [context, side, align, sideOffset, alignOffset]);

    if (!context.context.open) return null;

    const contentProps = {
      ref,
      style: {
        position: context.strategy,
        top: context.y ?? 0,
        left: context.x ?? 0,
        ...style,
      },
      'aria-labelledby': context.labelId,
      'aria-describedby': context.descriptionId,
      className: `tiptap-popover ${className || ''}`,
      'data-side': side,
      'data-align': align,
      'data-state': context.context.open ? 'open' : 'closed',
      ...context.getFloatingProps(props),
    };

    const content =
      asChild && React.isValidElement(children) ? (
        React.cloneElement(children, {
          ...contentProps,
          ...(children.props as any),
        })
      ) : (
        <div {...contentProps}>{children}</div>
      );

    const wrappedContent = (
      <FloatingFocusManager context={context.context} modal={context.modal}>
        {content}
      </FloatingFocusManager>
    );

    if (portal) {
      return <FloatingPortal {...portalProps}>{wrappedContent}</FloatingPortal>;
    }

    return wrappedContent;
  },
);

PopoverTrigger.displayName = 'PopoverTrigger';
PopoverContent.displayName = 'PopoverContent';

export { Popover, PopoverTrigger, PopoverContent };
