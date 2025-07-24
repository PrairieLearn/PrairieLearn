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
import type { ComponentChildren, VNode } from 'preact';
import {
  cloneElement,
  createContext,
  isValidElement,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'preact/compat';
import '#components/tiptap-ui-primitive/popover/popover.scss';

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
  children: ComponentChildren;
}

const PopoverContext = createContext<PopoverContextValue | null>(null);

function usePopoverContext() {
  const context = useContext(PopoverContext);
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
  const [uncontrolledOpen, setUncontrolledOpen] = useState(initialOpen);
  const [labelId, setLabelId] = useState<string>();
  const [descriptionId, setDescriptionId] = useState<string>();
  const [currentPlacement, setCurrentPlacement] = useState<Placement>(
    `${side}-${align}` as Placement,
  );
  const [offsets, setOffsets] = useState({ sideOffset, alignOffset });

  const open = controlledOpen ?? uncontrolledOpen;
  const setOpen = setControlledOpen ?? setUncontrolledOpen;

  const middleware = useMemo(
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

  const updatePosition = useCallback(
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

  return useMemo(
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

interface TriggerElementProps {
  children?: ComponentChildren;
  asChild?: boolean;
  [key: string]: any;
}

function PopoverTrigger({ children, asChild = false, ...props }: TriggerElementProps) {
  const context = usePopoverContext();
  const childrenRef =
    isValidElement(children) &&
    typeof children === 'object' &&
    children !== null &&
    'ref' in children
      ? (children as any).ref
      : undefined;
  const ref = useMergeRefs([context.refs.setReference, props.ref, childrenRef]);

  if (asChild && isValidElement(children) && typeof children === 'object') {
    const childVNode = children as VNode<any>;
    return cloneElement(
      childVNode,
      context.getReferenceProps({
        ref,
        ...props,
        ...(childVNode.props || {}),
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
}

interface PopoverContentProps {
  className?: string;
  side?: 'top' | 'right' | 'bottom' | 'left';
  align?: 'start' | 'center' | 'end';
  sideOffset?: number;
  alignOffset?: number;
  style?: any;
  portal?: boolean;
  portalProps?: any;
  asChild?: boolean;
  children?: ComponentChildren;
  [key: string]: any;
}

const DEFAULT_PORTAL_PROPS = {};
function PopoverContent({
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
}: PopoverContentProps) {
  const context = usePopoverContext();
  const childrenRef =
    isValidElement(children) &&
    typeof children === 'object' &&
    children !== null &&
    'ref' in children
      ? (children as any).ref
      : undefined;
  const ref = useMergeRefs([context.refs.setFloating, props.ref, childrenRef]);

  useEffect(() => {
    context.updatePosition(side, align, sideOffset, alignOffset);
  }, [context, side, align, sideOffset, alignOffset]);

  if (!context.context.open) return null;

  const contentProps = {
    ref,
    style: {
      position: context.strategy,
      top: context.y ?? 0,
      left: context.x ?? 0,
      ...(style || {}),
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
    asChild && isValidElement(children) && typeof children === 'object' ? (
      cloneElement(children as VNode<any>, {
        ...contentProps,
        ...((children as VNode<any>).props || {}),
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
}

PopoverTrigger.displayName = 'PopoverTrigger';
PopoverContent.displayName = 'PopoverContent';

export { Popover, PopoverTrigger, PopoverContent };
