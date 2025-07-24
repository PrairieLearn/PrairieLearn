import { Highlight } from '@tiptap/extension-highlight';
import { Image } from '@tiptap/extension-image';
import { Subscript } from '@tiptap/extension-subscript';
import { Superscript } from '@tiptap/extension-superscript';
import { TaskItem } from '@tiptap/extension-task-item';
import { TaskList } from '@tiptap/extension-task-list';
import { TextAlign } from '@tiptap/extension-text-align';
import { Typography } from '@tiptap/extension-typography';
import { Underline } from '@tiptap/extension-underline';
import { EditorContent, EditorContext, useEditor } from '@tiptap/react';
import { StarterKit } from '@tiptap/starter-kit';
import * as React from 'react';

import { Link } from '#components/tiptap-extension/link-extension.js';
import { Selection } from '#components/tiptap-extension/selection-extension.js';
import { TrailingNode } from '#components/tiptap-extension/trailing-node-extension.js';
import { ImageUploadNode } from '#components/tiptap-node/image-upload-node/image-upload-node-extension.js';
import { ThemeToggle } from '#components/tiptap-templates/simple/theme-toggle.js';
import { BlockquoteButton } from '#components/tiptap-ui/blockquote-button/index.js';
import { CodeBlockButton } from '#components/tiptap-ui/code-block-button/index.js';
import {
  ColorHighlightPopover,
  ColorHighlightPopoverButton,
  ColorHighlightPopoverContent,
} from '#components/tiptap-ui/color-highlight-popover/index.js';
import { HeadingDropdownMenu } from '#components/tiptap-ui/heading-dropdown-menu/index.js';
import { ImageUploadButton } from '#components/tiptap-ui/image-upload-button/index.js';
import { LinkButton, LinkContent, LinkPopover } from '#components/tiptap-ui/link-popover/index.js';
import { ListDropdownMenu } from '#components/tiptap-ui/list-dropdown-menu/index.js';
import { MarkButton } from '#components/tiptap-ui/mark-button/index.js';
import { TextAlignButton } from '#components/tiptap-ui/text-align-button/index.js';
import { UndoRedoButton } from '#components/tiptap-ui/undo-redo-button/index.js';
import { Button } from '#components/tiptap-ui-primitive/button/index.js';
import { Spacer } from '#components/tiptap-ui-primitive/spacer/index.js';
import {
  Toolbar,
  ToolbarGroup,
  ToolbarSeparator,
} from '#components/tiptap-ui-primitive/toolbar/index.js';
import { useCursorVisibility } from '#lib/hooks/use-cursor-visibility.js';
import { useMobile } from '#lib/hooks/use-mobile.js';
import { useWindowSize } from '#lib/hooks/use-window-size.js';
import '#components/tiptap-node/code-block-node/code-block-node.scss';
import '#components/tiptap-node/list-node/list-node.scss';
import '#components/tiptap-node/image-node/image-node.scss';
import '#components/tiptap-node/paragraph-node/paragraph-node.scss';
import { MAX_FILE_SIZE, handleImageUpload } from '#lib/tiptap-utils.js';

import '#components/tiptap-templates/simple/simple-editor.scss';

const content = {
  type: 'doc',
  content: [
    {
      type: 'heading',
      attrs: {
        textAlign: null,
        level: 1,
      },
      content: [
        {
          type: 'text',
          text: 'Getting started',
        },
      ],
    },
    {
      type: 'paragraph',
      attrs: {
        textAlign: null,
      },
      content: [
        {
          type: 'text',
          text: 'Welcome to the ',
        },
        {
          type: 'text',
          marks: [
            {
              type: 'italic',
            },
            {
              type: 'highlight',
              attrs: {
                color: 'var(--tt-color-highlight-yellow)',
              },
            },
          ],
          text: 'Simple Editor',
        },
        {
          type: 'text',
          text: ' template! This template integrates ',
        },
        {
          type: 'text',
          marks: [
            {
              type: 'bold',
            },
          ],
          text: 'open source',
        },
        {
          type: 'text',
          text: ' UI components and Tiptap extensions licensed under ',
        },
        {
          type: 'text',
          marks: [
            {
              type: 'bold',
            },
          ],
          text: 'MIT',
        },
        {
          type: 'text',
          text: '.',
        },
      ],
    },
    {
      type: 'paragraph',
      attrs: {
        textAlign: null,
      },
      content: [
        {
          type: 'text',
          text: 'Integrate it by following the ',
        },
        {
          type: 'text',
          marks: [
            {
              type: 'link',
              attrs: {
                href: 'https://tiptap.dev/docs/ui-components/templates/simple-editor',
                target: '_blank',
                rel: 'noopener noreferrer nofollow',
                class: null,
              },
            },
          ],
          text: 'Tiptap UI Components docs',
        },
        {
          type: 'text',
          text: ' or using our CLI tool.',
        },
      ],
    },
    {
      type: 'codeBlock',
      attrs: {
        language: null,
      },
      content: [
        {
          type: 'text',
          text: 'npx @tiptap/cli init',
        },
      ],
    },
    {
      type: 'heading',
      attrs: {
        textAlign: null,
        level: 2,
      },
      content: [
        {
          type: 'text',
          text: 'Features',
        },
      ],
    },
    {
      type: 'blockquote',
      content: [
        {
          type: 'paragraph',
          attrs: {
            textAlign: null,
          },
          content: [
            {
              type: 'text',
              marks: [
                {
                  type: 'italic',
                },
              ],
              text: 'A fully responsive rich text editor with built-in support for common formatting and layout tools. Type markdown ',
            },
            {
              type: 'text',
              marks: [
                {
                  type: 'code',
                },
              ],
              text: '**',
            },
            {
              type: 'text',
              marks: [
                {
                  type: 'italic',
                },
              ],
              text: ' or use keyboard shortcuts ',
            },
            {
              type: 'text',
              marks: [
                {
                  type: 'code',
                },
              ],
              text: '⌘+B',
            },
            {
              type: 'text',
              text: ' for ',
            },
            {
              type: 'text',
              marks: [
                {
                  type: 'strike',
                },
              ],
              text: 'most',
            },
            {
              type: 'text',
              text: ' all common markdown marks. 🪄',
            },
          ],
        },
      ],
    },
    {
      type: 'paragraph',
      attrs: {
        textAlign: 'left',
      },
      content: [
        {
          type: 'text',
          text: 'Add images, customize alignment, and apply ',
        },
        {
          type: 'text',
          marks: [
            {
              type: 'highlight',
              attrs: {
                color: 'var(--tt-color-highlight-blue)',
              },
            },
          ],
          text: 'advanced formatting',
        },
        {
          type: 'text',
          text: ' to make your writing more engaging and professional.',
        },
      ],
    },
    {
      type: 'image',
      attrs: {
        src: '/images/placeholder-image.png',
        alt: 'placeholder-image',
        title: 'placeholder-image',
      },
    },
    {
      type: 'bulletList',
      content: [
        {
          type: 'listItem',
          content: [
            {
              type: 'paragraph',
              attrs: {
                textAlign: 'left',
              },
              content: [
                {
                  type: 'text',
                  marks: [
                    {
                      type: 'bold',
                    },
                  ],
                  text: 'Superscript',
                },
                {
                  type: 'text',
                  text: ' (x',
                },
                {
                  type: 'text',
                  marks: [
                    {
                      type: 'superscript',
                    },
                  ],
                  text: '2',
                },
                {
                  type: 'text',
                  text: ') and ',
                },
                {
                  type: 'text',
                  marks: [
                    {
                      type: 'bold',
                    },
                  ],
                  text: 'Subscript',
                },
                {
                  type: 'text',
                  text: ' (H',
                },
                {
                  type: 'text',
                  marks: [
                    {
                      type: 'subscript',
                    },
                  ],
                  text: '2',
                },
                {
                  type: 'text',
                  text: 'O) for precision.',
                },
              ],
            },
          ],
        },
        {
          type: 'listItem',
          content: [
            {
              type: 'paragraph',
              attrs: {
                textAlign: 'left',
              },
              content: [
                {
                  type: 'text',
                  marks: [
                    {
                      type: 'bold',
                    },
                  ],
                  text: 'Typographic conversion',
                },
                {
                  type: 'text',
                  text: ': automatically convert to ',
                },
                {
                  type: 'text',
                  marks: [
                    {
                      type: 'code',
                    },
                  ],
                  text: '->',
                },
                {
                  type: 'text',
                  text: ' an arrow ',
                },
                {
                  type: 'text',
                  marks: [
                    {
                      type: 'bold',
                    },
                  ],
                  text: '→',
                },
                {
                  type: 'text',
                  text: '.',
                },
              ],
            },
          ],
        },
      ],
    },
    {
      type: 'paragraph',
      attrs: {
        textAlign: 'left',
      },
      content: [
        {
          type: 'text',
          marks: [
            {
              type: 'italic',
            },
          ],
          text: '→ ',
        },
        {
          type: 'text',
          marks: [
            {
              type: 'link',
              attrs: {
                href: 'https://tiptap.dev/docs/ui-components/templates/simple-editor#features',
                target: '_blank',
                rel: 'noopener noreferrer nofollow',
                class: null,
              },
            },
          ],
          text: 'Learn more',
        },
      ],
    },
    {
      type: 'horizontalRule',
    },
    {
      type: 'heading',
      attrs: {
        textAlign: 'left',
        level: 2,
      },
      content: [
        {
          type: 'text',
          text: 'Make it your own',
        },
      ],
    },
    {
      type: 'paragraph',
      attrs: {
        textAlign: 'left',
      },
      content: [
        {
          type: 'text',
          text: "Switch between light and dark modes, and tailor the editor's appearance with customizable CSS to match your style.",
        },
      ],
    },
    {
      type: 'taskList',
      content: [
        {
          type: 'taskItem',
          attrs: {
            checked: true,
          },
          content: [
            {
              type: 'paragraph',
              attrs: {
                textAlign: 'left',
              },
              content: [
                {
                  type: 'text',
                  text: 'Test template',
                },
              ],
            },
          ],
        },
        {
          type: 'taskItem',
          attrs: {
            checked: false,
          },
          content: [
            {
              type: 'paragraph',
              attrs: {
                textAlign: 'left',
              },
              content: [
                {
                  type: 'text',
                  marks: [
                    {
                      type: 'link',
                      attrs: {
                        href: 'https://tiptap.dev/docs/ui-components/templates/simple-editor',
                        target: '_blank',
                        rel: 'noopener noreferrer nofollow',
                        class: null,
                      },
                    },
                  ],
                  text: 'Integrate the free template',
                },
              ],
            },
          ],
        },
      ],
    },
    {
      type: 'paragraph',
      attrs: {
        textAlign: 'left',
      },
    },
  ],
};

const MainToolbarContent = ({
  onHighlighterClick,
  onLinkClick,
  isMobile,
}: {
  onHighlighterClick: () => void;
  onLinkClick: () => void;
  isMobile: boolean;
}) => {
  return (
    <>
      <Spacer />

      <ToolbarGroup>
        <UndoRedoButton action="undo" />
        <UndoRedoButton action="redo" />
      </ToolbarGroup>

      <ToolbarSeparator />

      <ToolbarGroup>
        <HeadingDropdownMenu levels={[1, 2, 3, 4]} />
        <ListDropdownMenu types={['bulletList', 'orderedList', 'taskList']} />
        <BlockquoteButton />
        <CodeBlockButton />
      </ToolbarGroup>

      <ToolbarSeparator />

      <ToolbarGroup>
        <MarkButton type="bold" />
        <MarkButton type="italic" />
        <MarkButton type="strike" />
        <MarkButton type="code" />
        <MarkButton type="underline" />
        {!isMobile ? (
          <ColorHighlightPopover />
        ) : (
          <ColorHighlightPopoverButton onClick={onHighlighterClick} />
        )}
        {!isMobile ? <LinkPopover /> : <LinkButton onClick={onLinkClick} />}
      </ToolbarGroup>

      <ToolbarSeparator />

      <ToolbarGroup>
        <MarkButton type="superscript" />
        <MarkButton type="subscript" />
      </ToolbarGroup>

      <ToolbarSeparator />

      <ToolbarGroup>
        <TextAlignButton align="left" />
        <TextAlignButton align="center" />
        <TextAlignButton align="right" />
        <TextAlignButton align="justify" />
      </ToolbarGroup>

      <ToolbarSeparator />

      <ToolbarGroup>
        <ImageUploadButton text="Add" />
      </ToolbarGroup>

      <Spacer />

      {isMobile && <ToolbarSeparator />}

      <ToolbarGroup>
        <ThemeToggle />
      </ToolbarGroup>
    </>
  );
};

const MobileToolbarContent = ({
  type,
  onBack,
}: {
  type: 'highlighter' | 'link';
  onBack: () => void;
}) => (
  <>
    <ToolbarGroup>
      <Button data-style="ghost" onClick={onBack}>
        <i class="bi bi-arrow-left tiptap-button-icon" />
        {type === 'highlighter' ? (
          <i class="bi bi-highlighter tiptap-button-icon" />
        ) : (
          <i class="bi bi-link tiptap-button-icon" />
        )}
      </Button>
    </ToolbarGroup>

    <ToolbarSeparator />

    {type === 'highlighter' ? <ColorHighlightPopoverContent /> : <LinkContent />}
  </>
);

export function SimpleEditor() {
  const isMobile = useMobile();
  const windowSize = useWindowSize();
  const [mobileView, setMobileView] = React.useState<'main' | 'highlighter' | 'link'>('main');
  const toolbarRef = React.useRef<HTMLDivElement>(null);

  const editor = useEditor({
    immediatelyRender: false,
    editorProps: {
      attributes: {
        autocomplete: 'off',
        autocorrect: 'off',
        autocapitalize: 'off',
        'aria-label': 'Main content area, start typing to enter text.',
      },
    },
    extensions: [
      StarterKit,
      TextAlign.configure({ types: ['heading', 'paragraph'] }),
      Underline,
      TaskList,
      TaskItem.configure({ nested: true }),
      Highlight.configure({ multicolor: true }),
      Image,
      Typography,
      Superscript,
      Subscript,

      Selection,
      ImageUploadNode.configure({
        accept: 'image/*',
        maxSize: MAX_FILE_SIZE,
        limit: 3,
        upload: handleImageUpload,
        onError: (error) => console.error('Upload failed:', error),
      }),
      TrailingNode,
      Link.configure({ openOnClick: false }),
    ],
    content,
  });

  const bodyRect = useCursorVisibility({
    editor,
    overlayHeight: toolbarRef.current?.getBoundingClientRect().height ?? 0,
  });

  React.useEffect(() => {
    if (!isMobile && mobileView !== 'main') {
      // eslint-disable-next-line @eslint-react/hooks-extra/no-direct-set-state-in-use-effect
      setMobileView('main');
    }
  }, [isMobile, mobileView]);

  return (
    // eslint-disable-next-line @eslint-react/no-unstable-context-value
    <EditorContext.Provider value={{ editor }}>
      <Toolbar
        ref={toolbarRef}
        style={
          isMobile
            ? {
                bottom: `calc(100% - ${windowSize.height - bodyRect.y}px)`,
              }
            : {}
        }
      >
        {mobileView === 'main' ? (
          <MainToolbarContent
            isMobile={isMobile}
            onHighlighterClick={() => setMobileView('highlighter')}
            onLinkClick={() => setMobileView('link')}
          />
        ) : (
          <MobileToolbarContent
            type={mobileView === 'highlighter' ? 'highlighter' : 'link'}
            onBack={() => setMobileView('main')}
          />
        )}
      </Toolbar>

      <div className="content-wrapper">
        <EditorContent editor={editor} role="presentation" className="simple-editor-content" />
      </div>
    </EditorContext.Provider>
  );
}
