/* eslint-disable react-you-might-not-need-an-effect/no-pass-live-state-to-parent */
/* eslint-disable @eslint-react/hooks-extra/no-direct-set-state-in-use-effect */
import { type Editor, isNodeSelection } from '@tiptap/react';
import * as React from 'react';

import { Button, type ButtonProps } from '#components/tiptap-ui-primitive/button/index.js';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '#components/tiptap-ui-primitive/popover/index.js';
import { Separator } from '#components/tiptap-ui-primitive/separator/index.js';
import { useTiptapEditor } from '#lib/hooks/use-tiptap-editor.js';
import { isMarkInSchema, sanitizeUrl } from '#lib/tiptap-utils.js';

// --- Styles ---
import '@/components/tiptap-ui/link-popover/link-popover.scss';

export interface LinkHandlerProps {
  editor: Editor | null;
  onSetLink?: () => void;
  onLinkActive?: () => void;
}

export interface LinkMainProps {
  url: string;
  setUrl: React.Dispatch<React.SetStateAction<string | null>>;
  setLink: () => void;
  removeLink: () => void;
  isActive: boolean;
}

export const useLinkHandler = (props: LinkHandlerProps) => {
  const { editor, onSetLink, onLinkActive } = props;
  const [url, setUrl] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!editor) return;

    // Get URL immediately on mount
    const { href } = editor.getAttributes('link');

    if (editor.isActive('link') && url === null) {
      setUrl(href || '');
      onLinkActive?.();
    }
  }, [editor, onLinkActive, url]);

  React.useEffect(() => {
    if (!editor) return;

    const updateLinkState = () => {
      const { href } = editor.getAttributes('link');
      setUrl(href || '');

      if (editor.isActive('link') && url !== null) {
        onLinkActive?.();
      }
    };

    editor.on('selectionUpdate', updateLinkState);
    return () => {
      editor.off('selectionUpdate', updateLinkState);
    };
  }, [editor, onLinkActive, url]);

  const setLink = React.useCallback(() => {
    if (!url || !editor) return;

    editor.chain().focus().extendMarkRange('link').setLink({ href: url }).run();

    setUrl(null);

    onSetLink?.();
  }, [editor, onSetLink, url]);

  const removeLink = React.useCallback(() => {
    if (!editor) return;
    editor
      .chain()
      .focus()
      .extendMarkRange('link')
      .unsetLink()
      .setMeta('preventAutolink', true)
      .run();
    setUrl('');
  }, [editor]);

  return {
    url: url || '',
    setUrl,
    setLink,
    removeLink,
    isActive: editor?.isActive('link') || false,
  };
};

export const LinkButton = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, children, ...props }, ref) => {
    return (
      <Button
        ref={ref}
        type="button"
        className={className}
        data-style="ghost"
        role="button"
        tabIndex={-1}
        aria-label="Link"
        tooltip="Link"
        {...props}
      >
        {children || <i class="bi bi-link tiptap-button-icon" />}
      </Button>
    );
  },
);

export const LinkContent: React.FC<{
  editor?: Editor | null;
}> = ({ editor: providedEditor }) => {
  const editor = useTiptapEditor(providedEditor);

  const linkHandler = useLinkHandler({
    editor,
  });

  return <LinkMain {...linkHandler} />;
};

const LinkMain: React.FC<LinkMainProps> = ({ url, setUrl, setLink, removeLink, isActive }) => {
  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      setLink();
    }
  };

  const handleOpenLink = () => {
    if (!url) return;

    const safeUrl = sanitizeUrl(url, window.location.href);
    if (safeUrl !== '#') {
      window.open(safeUrl, '_blank', 'noopener,noreferrer');
    }
  };

  return (
    <>
      <input
        type="url"
        placeholder="Paste a link..."
        value={url}
        autoComplete="off"
        autoCorrect="off"
        autoCapitalize="off"
        className="tiptap-input tiptap-input-clamp"
        onChange={(e) => setUrl((e.target as HTMLInputElement).value)}
        onKeyDown={handleKeyDown}
      />

      <div className="tiptap-button-group" data-orientation="horizontal">
        <Button
          type="button"
          title="Apply link"
          disabled={!url && !isActive}
          data-style="ghost"
          onClick={setLink}
        >
          <i class="bi bi-box-arrow-down-left tiptap-button-icon" />
        </Button>
      </div>

      <Separator />

      <div className="tiptap-button-group" data-orientation="horizontal">
        <Button
          type="button"
          title="Open in new window"
          disabled={!url && !isActive}
          data-style="ghost"
          onClick={handleOpenLink}
        >
          <i class="bi bi-box-arrow-up-right tiptap-button-icon" />
        </Button>

        <Button
          type="button"
          title="Remove link"
          disabled={!url && !isActive}
          data-style="ghost"
          onClick={removeLink}
        >
          <i class="bi bi-trash tiptap-button-icon" />
        </Button>
      </div>
    </>
  );
};

export interface LinkPopoverProps extends Omit<ButtonProps, 'type'> {
  /**
   * The TipTap editor instance.
   */
  editor?: Editor | null;
  /**
   * Whether to hide the link popover.
   * @default false
   */
  hideWhenUnavailable?: boolean;
  /**
   * Callback for when the popover opens or closes.
   */
  onOpenChange?: (isOpen: boolean) => void;
  /**
   * Whether to automatically open the popover when a link is active.
   * @default true
   */
  autoOpenOnLinkActive?: boolean;
}

export function LinkPopover({
  editor: providedEditor,
  hideWhenUnavailable = false,
  onOpenChange,
  autoOpenOnLinkActive = true,
  ...props
}: LinkPopoverProps) {
  const editor = useTiptapEditor(providedEditor);

  const linkInSchema = isMarkInSchema('link', editor);

  const [isOpen, setIsOpen] = React.useState(false);

  const onSetLink = () => {
    setIsOpen(false);
  };

  const onLinkActive = () => setIsOpen(autoOpenOnLinkActive);

  const linkHandler = useLinkHandler({
    editor,
    onSetLink,
    onLinkActive,
  });

  const isDisabled = React.useMemo(() => {
    if (!editor) return true;
    if (editor.isActive('codeBlock')) return true;
    return !editor.can().setLink?.({ href: '' });
  }, [editor]);

  const canSetLink = React.useMemo(() => {
    if (!editor) return false;
    try {
      return editor.can().setMark('link');
    } catch {
      return false;
    }
  }, [editor]);

  const isActive = editor?.isActive('link') ?? false;

  const handleOnOpenChange = React.useCallback(
    (nextIsOpen: boolean) => {
      setIsOpen(nextIsOpen);
      onOpenChange?.(nextIsOpen);
    },
    [onOpenChange],
  );

  const show = React.useMemo(() => {
    if (!linkInSchema || !editor) {
      return false;
    }

    if (hideWhenUnavailable) {
      if (isNodeSelection(editor.state.selection) || !canSetLink) {
        return false;
      }
    }

    return true;
  }, [linkInSchema, hideWhenUnavailable, editor, canSetLink]);

  if (!show || !editor || !editor.isEditable) {
    return null;
  }

  return (
    <Popover open={isOpen} onOpenChange={handleOnOpenChange}>
      <PopoverTrigger asChild>
        <LinkButton
          disabled={isDisabled}
          data-active-state={isActive ? 'on' : 'off'}
          data-disabled={isDisabled}
          {...props}
        />
      </PopoverTrigger>

      <PopoverContent>
        <LinkMain {...linkHandler} />
      </PopoverContent>
    </Popover>
  );
}

LinkButton.displayName = 'LinkButton';
