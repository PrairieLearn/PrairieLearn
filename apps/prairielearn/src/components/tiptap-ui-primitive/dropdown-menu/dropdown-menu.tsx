/* eslint-disable @eslint-react/dom/no-missing-button-type */
/* eslint-disable @eslint-react/no-clone-element */
import {
  FloatingFocusManager,
  FloatingList,
  FloatingPortal,
  type Placement,
  autoUpdate,
  flip,
  offset,
  shift,
  useClick,
  useDismiss,
  useFloating,
  useInteractions,
  useListItem,
  useListNavigation,
  useMergeRefs,
  useRole,
  useTypeahead,
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
  useRef,
  useState,
} from 'preact/compat';

import '#components/tiptap-ui-primitive/dropdown-menu/dropdown-menu.scss';
import { Separator } from '#components/tiptap-ui-primitive/separator/index.js';

interface DropdownMenuOptions {
  initialOpen?: boolean;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  side?: 'top' | 'right' | 'bottom' | 'left';
  align?: 'start' | 'center' | 'end';
}

interface DropdownMenuProps extends DropdownMenuOptions {
  children: ComponentChildren;
}

type ContextType = ReturnType<typeof useDropdownMenu> & {
  updatePosition: (
    side: 'top' | 'right' | 'bottom' | 'left',
    align: 'start' | 'center' | 'end',
  ) => void;
};

const DropdownMenuContext = createContext<ContextType | null>(null);

function useDropdownMenuContext() {
  const context = useContext(DropdownMenuContext);
  if (!context) {
    throw new Error('DropdownMenu components must be wrapped in <DropdownMenu />');
  }
  return context;
}

function useDropdownMenu({
  initialOpen = false,
  open: controlledOpen,
  onOpenChange: setControlledOpen,
  side = 'bottom',
  align = 'start',
}: DropdownMenuOptions) {
  const [uncontrolledOpen, setUncontrolledOpen] = useState(initialOpen);
  const [currentPlacement, setCurrentPlacement] = useState<Placement>(
    `${side}-${align}` as Placement,
  );
  const [activeIndex, setActiveIndex] = useState<number | null>(null);

  const open = controlledOpen ?? uncontrolledOpen;
  const setOpen = setControlledOpen ?? setUncontrolledOpen;

  const elementsRef = useRef<(HTMLElement | null)[]>([]);
  const labelsRef = useRef<(string | null)[]>([]);

  const floating = useFloating({
    open,
    onOpenChange: setOpen,
    placement: currentPlacement,
    middleware: [offset({ mainAxis: 4 }), flip(), shift({ padding: 4 })],
    whileElementsMounted: autoUpdate,
  });

  const { context } = floating;

  const interactions = useInteractions([
    useClick(context, {
      event: 'mousedown',
      toggle: true,
      ignoreMouse: false,
    }),
    useRole(context, { role: 'menu' }),
    useDismiss(context, {
      outsidePress: true,
      outsidePressEvent: 'mousedown',
    }),
    useListNavigation(context, {
      listRef: elementsRef,
      activeIndex,
      onNavigate: setActiveIndex,
      loop: true,
    }),
    useTypeahead(context, {
      listRef: labelsRef,
      onMatch: open ? setActiveIndex : undefined,
      activeIndex,
    }),
  ]);

  const updatePosition = useCallback(
    (newSide: 'top' | 'right' | 'bottom' | 'left', newAlign: 'start' | 'center' | 'end') => {
      setCurrentPlacement(`${newSide}-${newAlign}` as Placement);
    },
    [],
  );

  return useMemo(
    () => ({
      open,
      setOpen,
      activeIndex,
      setActiveIndex,
      elementsRef,
      labelsRef,
      updatePosition,
      ...interactions,
      ...floating,
    }),
    [open, setOpen, activeIndex, interactions, floating, updatePosition],
  );
}

export function DropdownMenu({ children, ...options }: DropdownMenuProps) {
  const dropdown = useDropdownMenu(options);
  return (
    <DropdownMenuContext.Provider value={dropdown}>
      <FloatingList elementsRef={dropdown.elementsRef} labelsRef={dropdown.labelsRef}>
        {children}
      </FloatingList>
    </DropdownMenuContext.Provider>
  );
}

interface DropdownMenuTriggerProps {
  children?: ComponentChildren;
  asChild?: boolean;
  [key: string]: any;
}

export function DropdownMenuTrigger({
  children,
  asChild = false,
  ...props
}: DropdownMenuTriggerProps) {
  const context = useDropdownMenuContext();
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
      'data-state': context.open ? 'open' : 'closed',
    };

    const childVNode = children as VNode<any>;
    return cloneElement(
      childVNode,
      context.getReferenceProps({
        ref,
        ...props,
        ...(childVNode.props || {}),
        'aria-expanded': context.open,
        'aria-haspopup': 'menu' as const,
        ...dataAttributes,
      }),
    );
  }

  return (
    <button
      ref={ref}
      aria-expanded={context.open}
      aria-haspopup="menu"
      data-state={context.open ? 'open' : 'closed'}
      {...context.getReferenceProps(props)}
    >
      {children}
    </button>
  );
}

DropdownMenuTrigger.displayName = 'DropdownMenuTrigger';

interface DropdownMenuContentProps {
  children?: ComponentChildren;
  style?: any;
  className?: string;
  orientation?: 'vertical' | 'horizontal';
  side?: 'top' | 'right' | 'bottom' | 'left';
  align?: 'start' | 'center' | 'end';
  portal?: boolean;
  portalProps?: any;
  [key: string]: any;
}

const DEFAULT_PORTAL_PROPS = {};

export function DropdownMenuContent({
  style,
  className,
  orientation = 'vertical',
  side = 'bottom',
  align = 'start',
  portal = true,
  portalProps = DEFAULT_PORTAL_PROPS,
  children,
  ...props
}: DropdownMenuContentProps) {
  const context = useDropdownMenuContext();
  const ref = useMergeRefs([context.refs.setFloating, props.ref]);

  useEffect(() => {
    context.updatePosition(side, align);
  }, [context, side, align]);

  if (!context.open) return null;

  const content = (
    <FloatingFocusManager
      context={context.context}
      modal={false}
      initialFocus={0}
      returnFocus={true}
    >
      <div
        ref={ref}
        className={`tiptap-dropdown-menu ${className || ''}`}
        style={{
          position: context.strategy,
          top: context.y ?? 0,
          left: context.x ?? 0,
          outline: 'none',
          ...(style || {}),
        }}
        aria-orientation={orientation}
        data-orientation={orientation}
        data-state={context.open ? 'open' : 'closed'}
        data-side={side}
        data-align={align}
        {...context.getFloatingProps(props)}
      >
        {children}
      </div>
    </FloatingFocusManager>
  );

  if (portal) {
    return <FloatingPortal {...portalProps}>{content}</FloatingPortal>;
  }

  return content;
}

DropdownMenuContent.displayName = 'DropdownMenuContent';

interface DropdownMenuItemProps {
  children?: ComponentChildren;
  asChild?: boolean;
  disabled?: boolean;
  onSelect?: () => void;
  className?: string;
  onClick?: (event: any) => void;
  [key: string]: any;
}

export function DropdownMenuItem({
  children,
  disabled,
  asChild = false,
  onSelect,
  className,
  ...props
}: DropdownMenuItemProps) {
  const context = useDropdownMenuContext();
  const item = useListItem({ label: disabled ? null : children?.toString() });
  const isActive = context.activeIndex === item.index;

  const handleSelect = useCallback(
    (event: any) => {
      if (disabled) return;
      onSelect?.();
      props.onClick?.(event);
      context.setOpen(false);
    },
    [context, disabled, onSelect, props],
  );

  const itemProps = {
    ref: useMergeRefs([item.ref, props.ref]),
    role: 'menuitem' as any,
    className,
    tabIndex: isActive ? 0 : -1,
    'data-highlighted': isActive,
    'aria-disabled': disabled,
    ...context.getItemProps({
      ...props,
      onClick: handleSelect,
    }),
  };

  if (asChild && isValidElement(children) && typeof children === 'object') {
    const childVNode = children as VNode<any>;
    const childProps = childVNode.props || {};

    // Create merged props without adding onClick directly to the props object
    const mergedProps = {
      ...itemProps,
      ...childProps,
    };

    // Handle onClick separately based on the element type
    const eventHandlers = {
      onClick: (event: any) => {
        // Cast the event to make it compatible with handleSelect
        handleSelect(event);
        childProps.onClick?.(event);
      },
    };

    return cloneElement(childVNode, {
      ...mergedProps,
      ...eventHandlers,
    });
  }

  return <div {...itemProps}>{children}</div>;
}

DropdownMenuItem.displayName = 'DropdownMenuItem';

interface DropdownMenuGroupProps {
  children?: ComponentChildren;
  label?: string;
  className?: string;
  [key: string]: any;
}

export function DropdownMenuGroup({
  children,
  label,
  className,
  ...props
}: DropdownMenuGroupProps) {
  return (
    <div
      {...props}
      ref={props.ref}
      role="group"
      aria-label={label}
      className={`tiptap-button-group ${className || ''}`}
    >
      {children}
    </div>
  );
}

DropdownMenuGroup.displayName = 'DropdownMenuGroup';

interface DropdownMenuSeparatorProps {
  className?: string;
  [key: string]: any;
}

export function DropdownMenuSeparator({ className, ...props }: DropdownMenuSeparatorProps) {
  return (
    <Separator
      ref={props.ref}
      className={`tiptap-dropdown-menu-separator ${className || ''}`}
      {...props}
    />
  );
}

DropdownMenuSeparator.displayName = 'DropdownMenuSeparator';
