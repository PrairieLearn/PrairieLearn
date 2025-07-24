/* eslint-disable @eslint-react/no-clone-element */
import {
  FloatingDelayGroup,
  FloatingPortal,
  type Placement,
  type ReferenceType,
  type UseFloatingReturn,
  autoUpdate,
  flip,
  offset,
  shift,
  useDismiss,
  useFloating,
  useFocus,
  useHover,
  useInteractions,
  useMergeRefs,
  useRole,
} from '@floating-ui/react';
import type { ComponentChildren, VNode } from 'preact';
import {
  cloneElement,
  createContext,
  isValidElement,
  useContext,
  useMemo,
  useState,
} from 'preact/compat';
import '@/components/tiptap-ui-primitive/tooltip/tooltip.scss';

interface TooltipProviderProps {
  children: ComponentChildren;
  initialOpen?: boolean;
  placement?: Placement;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  delay?: number;
  closeDelay?: number;
  timeout?: number;
  useDelayGroup?: boolean;
}

interface TooltipTriggerProps {
  asChild?: boolean;
  children?: ComponentChildren;
  [key: string]: any;
}

interface TooltipContentProps {
  children?: ComponentChildren;
  style?: any;
  portal?: boolean;
  portalProps?: any;
  [key: string]: any;
}

interface TooltipContextValue extends UseFloatingReturn<ReferenceType> {
  open: boolean;
  setOpen: (open: boolean) => void;
  getReferenceProps: (userProps?: any) => Record<string, unknown>;
  getFloatingProps: (userProps?: any) => Record<string, unknown>;
}

function useTooltip({
  initialOpen = false,
  placement = 'top',
  open: controlledOpen,
  onOpenChange: setControlledOpen,
  delay = 600,
  closeDelay = 0,
}: Omit<TooltipProviderProps, 'children'> = {}) {
  const [uncontrolledOpen, setUncontrolledOpen] = useState<boolean>(initialOpen);

  const open = controlledOpen ?? uncontrolledOpen;
  const setOpen = setControlledOpen ?? setUncontrolledOpen;

  const data = useFloating({
    placement,
    open,
    onOpenChange: setOpen,
    whileElementsMounted: autoUpdate,
    middleware: [
      offset(4),
      flip({
        crossAxis: placement.includes('-'),
        fallbackAxisSideDirection: 'start',
        padding: 4,
      }),
      shift({ padding: 4 }),
    ],
  });

  const context = data.context;

  const hover = useHover(context, {
    mouseOnly: true,
    move: false,
    restMs: delay,
    enabled: controlledOpen == null,
    delay: {
      close: closeDelay,
    },
  });
  const focus = useFocus(context, {
    enabled: controlledOpen == null,
  });
  const dismiss = useDismiss(context);
  const role = useRole(context, { role: 'tooltip' });

  const interactions = useInteractions([hover, focus, dismiss, role]);

  return useMemo(
    () => ({
      open,
      setOpen,
      ...interactions,
      ...data,
    }),
    [open, setOpen, interactions, data],
  );
}

const TooltipContext = createContext<TooltipContextValue | null>(null);

function useTooltipContext() {
  const context = useContext(TooltipContext);

  if (context == null) {
    throw new Error('Tooltip components must be wrapped in <TooltipProvider />');
  }

  return context;
}

export function Tooltip({ children, ...props }: TooltipProviderProps) {
  const tooltip = useTooltip(props);

  if (!props.useDelayGroup) {
    return <TooltipContext.Provider value={tooltip}>{children}</TooltipContext.Provider>;
  }

  return (
    <FloatingDelayGroup
      delay={{ open: props.delay ?? 0, close: props.closeDelay ?? 0 }}
      timeoutMs={props.timeout}
    >
      <TooltipContext.Provider value={tooltip}>{children}</TooltipContext.Provider>
    </FloatingDelayGroup>
  );
}

export function TooltipTrigger({ children, asChild = false, ...props }: TooltipTriggerProps) {
  const context = useTooltipContext();
  const childrenRef =
    isValidElement(children) &&
    typeof children === 'object' &&
    children !== null &&
    'ref' in children
      ? (children as any).ref
      : undefined;
  const ref = useMergeRefs([context.refs.setReference, props.ref, childrenRef]);

  if (asChild && isValidElement(children) && typeof children === 'object') {
    const dataAttributes = {
      'data-tooltip-state': context.open ? 'open' : 'closed',
    };

    const childVNode = children as VNode<any>;
    return cloneElement(
      childVNode,
      context.getReferenceProps({
        ref,
        ...props,
        ...(childVNode.props || {}),
        ...dataAttributes,
      }),
    );
  }

  return (
    <button
      ref={ref}
      type="button"
      data-tooltip-state={context.open ? 'open' : 'closed'}
      {...context.getReferenceProps(props)}
    >
      {children}
    </button>
  );
}

const DEFAULT_PORTAL_PROPS = {};
const DEFAULT_STYLE = {};

export function TooltipContent({
  style = DEFAULT_STYLE,
  children,
  portal = true,
  portalProps = DEFAULT_PORTAL_PROPS,
  ...props
}: TooltipContentProps) {
  const context = useTooltipContext();
  const ref = useMergeRefs([context.refs.setFloating, props.ref]);

  if (!context.open) return null;

  const content = (
    <div
      ref={ref}
      style={{
        ...context.floatingStyles,
        ...(style || {}),
      }}
      {...context.getFloatingProps(props)}
      className="tiptap-tooltip"
    >
      {children}
    </div>
  );

  if (portal) {
    return <FloatingPortal {...portalProps}>{content}</FloatingPortal>;
  }

  return content;
}

Tooltip.displayName = 'Tooltip';
TooltipTrigger.displayName = 'TooltipTrigger';
TooltipContent.displayName = 'TooltipContent';
