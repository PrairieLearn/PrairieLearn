import * as React from 'react';

import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '#components/tiptap-ui-primitive/tooltip/index.js';

import '#components/tiptap-ui-primitive/button/button-colors.scss';
import '#components/tiptap-ui-primitive/button/button-group.scss';
import '#components/tiptap-ui-primitive/button/button.scss';

type PlatformShortcuts = Record<string, string>;

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  className?: string;
  showTooltip?: boolean;
  tooltip?: React.ReactNode;
  shortcutKeys?: string;
}

export const MAC_SYMBOLS: PlatformShortcuts = {
  ctrl: '⌘',
  alt: '⌥',
  shift: '⇧',
} as const;

export const formatShortcutKey = (key: string, isMac: boolean) => {
  if (isMac) {
    const lowerKey = key.toLowerCase();
    return MAC_SYMBOLS[lowerKey] || key.toUpperCase();
  }
  return key.charAt(0).toUpperCase() + key.slice(1);
};

export const parseShortcutKeys = (shortcutKeys: string | undefined, isMac: boolean) => {
  if (!shortcutKeys) return [];

  return shortcutKeys
    .split('-')
    .map((key) => key.trim())
    .map((key) => formatShortcutKey(key, isMac));
};

export const ShortcutDisplay: React.FC<{ shortcuts: string[] }> = ({ shortcuts }) => {
  if (shortcuts.length === 0) return null;

  return (
    <div>
      {shortcuts.map((key, index) => (
        <React.Fragment key={key}>
          {index > 0 && <kbd>+</kbd>}
          <kbd>{key}</kbd>
        </React.Fragment>
      ))}
    </div>
  );
};

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      className = '',
      children,
      tooltip,
      showTooltip = true,
      shortcutKeys,
      'aria-label': ariaLabel,
      ...props
    },
    ref,
  ) => {
    const isMac = React.useMemo(
      () => typeof navigator !== 'undefined' && navigator.platform.toLowerCase().includes('mac'),
      [],
    );

    const shortcuts = React.useMemo(
      () => parseShortcutKeys(shortcutKeys, isMac),
      [shortcutKeys, isMac],
    );

    if (!tooltip || !showTooltip) {
      return (
        <button
          ref={ref}
          type="button"
          className={`tiptap-button ${className}`.trim()}
          aria-label={ariaLabel}
          {...props}
        >
          {children}
        </button>
      );
    }

    return (
      <Tooltip delay={200}>
        <TooltipTrigger
          ref={ref}
          className={`tiptap-button ${className}`.trim()}
          aria-label={ariaLabel}
          {...props}
        >
          {children}
        </TooltipTrigger>
        <TooltipContent>
          {tooltip}
          <ShortcutDisplay shortcuts={shortcuts} />
        </TooltipContent>
      </Tooltip>
    );
  },
);

Button.displayName = 'Button';

export default Button;
