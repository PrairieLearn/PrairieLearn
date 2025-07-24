import * as React from 'react';

import { Separator } from '#components/tiptap-ui-primitive/separator/index.js';
import '@/components/tiptap-ui-primitive/toolbar/toolbar.scss';

type BaseProps = React.HTMLAttributes<HTMLDivElement>;

interface ToolbarProps extends BaseProps {
  variant?: 'floating' | 'fixed';
}

const mergeRefs = <T,>(refs: (React.RefObject<T> | React.Ref<T> | null | undefined)[]) => {
  return (value) => {
    refs.forEach((ref) => {
      if (typeof ref === 'function') {
        ref(value);
      } else if (ref != null) {
        (ref as React.MutableRefObject<T | null>).current = value;
      }
    });
  };
};

const useObserveVisibility = (
  ref: React.RefObject<HTMLElement | null>,
  callback: () => void,
): void => {
  React.useEffect(() => {
    const element = ref.current;
    if (!element) return;

    let isMounted = true;

    if (isMounted) {
      requestAnimationFrame(callback);
    }

    const observer = new MutationObserver(() => {
      if (isMounted) {
        requestAnimationFrame(callback);
      }
    });

    observer.observe(element, {
      childList: true,
      subtree: true,
      attributes: true,
    });

    return () => {
      isMounted = false;
      observer.disconnect();
    };
  }, [ref, callback]);
};

const useToolbarKeyboardNav = (toolbarRef: React.RefObject<HTMLDivElement | null>): void => {
  React.useEffect(() => {
    const toolbar = toolbarRef.current;
    if (!toolbar) return;

    const getFocusableElements = () =>
      Array.from(
        toolbar.querySelectorAll<HTMLElement>(
          'button:not([disabled]), [role="button"]:not([disabled]), [tabindex="0"]:not([disabled])',
        ),
      );

    const navigateToIndex = (e: KeyboardEvent, targetIndex: number, elements: HTMLElement[]) => {
      e.preventDefault();
      let nextIndex = targetIndex;

      if (nextIndex >= elements.length) {
        nextIndex = 0;
      } else if (nextIndex < 0) {
        nextIndex = elements.length - 1;
      }

      elements[nextIndex]?.focus();
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      const focusableElements = getFocusableElements();
      if (!focusableElements.length) return;

      const currentElement = document.activeElement as HTMLElement;
      const currentIndex = focusableElements.indexOf(currentElement);

      if (!toolbar.contains(currentElement)) return;

      const keyActions: Record<string, () => void> = {
        ArrowRight: () => navigateToIndex(e, currentIndex + 1, focusableElements),
        ArrowDown: () => navigateToIndex(e, currentIndex + 1, focusableElements),
        ArrowLeft: () => navigateToIndex(e, currentIndex - 1, focusableElements),
        ArrowUp: () => navigateToIndex(e, currentIndex - 1, focusableElements),
        Home: () => navigateToIndex(e, 0, focusableElements),
        End: () => navigateToIndex(e, focusableElements.length - 1, focusableElements),
      };

      const action = keyActions[e.key];
      if (action) {
        action();
      }
    };

    const handleFocus = (e: FocusEvent) => {
      const target = e.target as HTMLElement;
      if (toolbar.contains(target)) {
        target.setAttribute('data-focus-visible', 'true');
      }
    };

    const handleBlur = (e: FocusEvent) => {
      const target = e.target as HTMLElement;
      if (toolbar.contains(target)) {
        target.removeAttribute('data-focus-visible');
      }
    };

    // eslint-disable-next-line react-you-might-not-need-an-effect/no-pass-live-state-to-parent
    toolbar.addEventListener('keydown', handleKeyDown);
    // eslint-disable-next-line react-you-might-not-need-an-effect/no-pass-live-state-to-parent
    toolbar.addEventListener('focus', handleFocus, true);
    // eslint-disable-next-line react-you-might-not-need-an-effect/no-pass-live-state-to-parent
    toolbar.addEventListener('blur', handleBlur, true);

    const focusableElements = getFocusableElements();
    focusableElements.forEach((element) => {
      element.addEventListener('focus', handleFocus);
      element.addEventListener('blur', handleBlur);
    });

    return () => {
      toolbar.removeEventListener('keydown', handleKeyDown);
      toolbar.removeEventListener('focus', handleFocus, true);
      toolbar.removeEventListener('blur', handleBlur, true);

      const focusableElements = getFocusableElements();
      focusableElements.forEach((element) => {
        element.removeEventListener('focus', handleFocus);
        element.removeEventListener('blur', handleBlur);
      });
    };
  }, [toolbarRef]);
};

const useToolbarVisibility = (ref: React.RefObject<HTMLDivElement | null>): boolean => {
  const [isVisible, setIsVisible] = React.useState(true);
  const isMountedRef = React.useRef(false);

  React.useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const checkVisibility = React.useCallback(() => {
    if (!isMountedRef.current) return;

    const toolbar = ref.current;
    if (!toolbar) return;

    // Check if any group has visible children
    const hasVisibleChildren = Array.from(toolbar.children).some((child) => {
      if (!(child instanceof HTMLElement)) return false;
      if (child.getAttribute('role') === 'group') {
        return child.children.length > 0;
      }
      return false;
    });

    setIsVisible(hasVisibleChildren);
  }, [ref]);

  useObserveVisibility(ref, checkVisibility);
  return isVisible;
};

const useGroupVisibility = (ref: React.RefObject<HTMLDivElement | null>): boolean => {
  const [isVisible, setIsVisible] = React.useState(true);
  const isMountedRef = React.useRef(false);

  React.useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const checkVisibility = React.useCallback(() => {
    if (!isMountedRef.current) return;

    const group = ref.current;
    if (!group) return;

    const hasVisibleChildren = Array.from(group.children).some((child) => {
      if (!(child instanceof HTMLElement)) return false;
      return true;
    });

    setIsVisible(hasVisibleChildren);
  }, [ref]);

  useObserveVisibility(ref, checkVisibility);
  return isVisible;
};

const useSeparatorVisibility = (ref: React.RefObject<HTMLDivElement | null>): boolean => {
  const [isVisible, setIsVisible] = React.useState(true);
  const isMountedRef = React.useRef(false);

  React.useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const checkVisibility = React.useCallback(() => {
    if (!isMountedRef.current) return;

    const separator = ref.current;
    if (!separator) return;

    const prevSibling = separator.previousElementSibling as HTMLElement;
    const nextSibling = separator.nextElementSibling as HTMLElement;

    if (!prevSibling || !nextSibling) {
      setIsVisible(false);
      return;
    }

    const areBothGroups =
      prevSibling.getAttribute('role') === 'group' && nextSibling.getAttribute('role') === 'group';

    const haveBothChildren = prevSibling.children.length > 0 && nextSibling.children.length > 0;

    setIsVisible(areBothGroups && haveBothChildren);
  }, [ref]);

  useObserveVisibility(ref, checkVisibility);
  return isVisible;
};

export const Toolbar = React.forwardRef<HTMLDivElement, ToolbarProps>(
  ({ children, className, variant = 'fixed', ...props }, ref) => {
    const toolbarRef = React.useRef<HTMLDivElement>(null);
    const isVisible = useToolbarVisibility(toolbarRef);

    useToolbarKeyboardNav(toolbarRef);

    if (!isVisible) return null;

    return (
      <div
        ref={mergeRefs([toolbarRef, ref])}
        role="toolbar"
        aria-label="toolbar"
        data-variant={variant}
        className={`tiptap-toolbar ${className || ''}`}
        {...props}
      >
        {children}
      </div>
    );
  },
);

Toolbar.displayName = 'Toolbar';

export const ToolbarGroup = React.forwardRef<HTMLDivElement, BaseProps>(
  ({ children, className, ...props }, ref) => {
    const groupRef = React.useRef<HTMLDivElement>(null);
    const isVisible = useGroupVisibility(groupRef);

    if (!isVisible) return null;

    return (
      <div
        ref={mergeRefs([groupRef, ref])}
        role="group"
        className={`tiptap-toolbar-group ${className || ''}`}
        {...props}
      >
        {children}
      </div>
    );
  },
);

ToolbarGroup.displayName = 'ToolbarGroup';

export const ToolbarSeparator = React.forwardRef<HTMLDivElement, BaseProps>(({ ...props }, ref) => {
  const separatorRef = React.useRef<HTMLDivElement>(null);
  const isVisible = useSeparatorVisibility(separatorRef);

  if (!isVisible) return null;

  return (
    <Separator ref={mergeRefs([separatorRef, ref])} orientation="vertical" decorative {...props} />
  );
});

ToolbarSeparator.displayName = 'ToolbarSeparator';
