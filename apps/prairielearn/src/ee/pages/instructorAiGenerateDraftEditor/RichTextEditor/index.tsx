/* eslint perfectionist/sort-sets: error */

import { Blockquote } from '@tiptap/extension-blockquote';
import { Bold } from '@tiptap/extension-bold';
import { BulletList } from '@tiptap/extension-bullet-list';
import { Code } from '@tiptap/extension-code';
import { Document } from '@tiptap/extension-document';
import DragHandle from '@tiptap/extension-drag-handle-react';
import { Dropcursor } from '@tiptap/extension-dropcursor';
import { Gapcursor } from '@tiptap/extension-gapcursor';
import { Heading } from '@tiptap/extension-heading';
import { Italic } from '@tiptap/extension-italic';
import { ListItem, ListKeymap, OrderedList } from '@tiptap/extension-list';
import { Paragraph } from '@tiptap/extension-paragraph';
import { Strike } from '@tiptap/extension-strike';
import { Subscript } from '@tiptap/extension-subscript';
import { Superscript } from '@tiptap/extension-superscript';
import { Text } from '@tiptap/extension-text';
import { Underline } from '@tiptap/extension-underline';
import { Focus, Selection, UndoRedo } from '@tiptap/extensions';
import { EditorContent, useEditor } from '@tiptap/react';
// import { BubbleMenu, FloatingMenu } from '@tiptap/react/menus';
import { useEffect, useState } from 'preact/compat';
import prettierHtmlPlugin from 'prettier/plugins/html';
import prettier from 'prettier/standalone';
import { Button, Card, Form, OverlayTrigger, Popover, Tooltip } from 'react-bootstrap';

import { PlPanel } from './extensions/pl-panel.js';
import { RawHtml } from './extensions/raw-html.js';

function formatHtmlWithPrettier(html: string): Promise<string> {
  // TODO: This is just for debugging, but is currently not sufficient for writing HTML back to a file.
  /* Our custom syntax isn't standard HTML.
  this means we'll need an HTML formatter that's aware of our own special flavor of HTML, with 
  e.g. <markdown>, <pl-code> being indentation-sensitive, Mustache, and so on. Maybe Prettier is the wrong tool for the job here?
  */

  return prettier.format(html, {
    parser: 'html',
    plugins: [prettierHtmlPlugin],
    printWidth: 100,
    tabWidth: 2,
  });
}

/**
 * The main rich text editor component.
 * @param params
 * @param params.htmlContents - The initial HTML contents of the editor.
 * @param params.csrfToken
 */
const RichTextEditor = ({
  csrfToken: _csrfToken,
  htmlContents,
}: {
  htmlContents: string | null;
  csrfToken: string;
}) => {
  const editor = useEditor({
    editorProps: {
      attributes: {
        'aria-label': 'Main content area, start typing to enter text.',
        autocapitalize: 'off',
        autocomplete: 'off',
        autocorrect: 'off',
      },
    },
    emitContentError: true,
    enableContentCheck: true,
    immediatelyRender: false,
    onContentError: (event) => {
      throw new Error(event.error.message);
    },
    onCreate: async ({ editor }) => {
      const formattedHtml = await formatHtmlWithPrettier(editor.getHTML());
      setFormattedHtml(formattedHtml);
    },
    onUpdate: async ({ editor }) => {
      const formattedHtml = await formatHtmlWithPrettier(editor.getHTML());
      setFormattedHtml(formattedHtml);
    },
    content: htmlContents,
    extensions: [
      ...new Set([
        Blockquote,
        Bold,
        BulletList,
        Code,
        Document,
        Dropcursor,
        Focus,
        Gapcursor,
        Heading,
        Italic,
        ListItem,
        ListKeymap,
        OrderedList,
        Paragraph,
        PlPanel,
        Selection,
        Strike,
        Subscript,
        Superscript,
        Text,
        Underline,
        UndoRedo,
        // For this to work, we need all the nodes to be matched correctly by the other extensions.
        RawHtml,
      ]),
    ],
  });
  const [formattedHtml, setFormattedHtml] = useState<string | null>(null);
  const [debugMode, setDebugMode] = useState<boolean>(false);
  const [_selectionVersion, setSelectionVersion] = useState<number>(0);

  useEffect(() => {
    if (editor === null) return;
    const handleSelectionUpdate = () => setSelectionVersion((v) => v + 1);
    editor.on('selectionUpdate', handleSelectionUpdate);
    return () => {
      editor.off('selectionUpdate', handleSelectionUpdate);
    };
  }, [editor]);

  if (htmlContents === null) {
    return null;
  }

  if (editor === null) {
    return null;
  }

  return (
    <>
      <Card class="m-3">
        <Card.Header>
          <div class="d-flex align-items-center justify-content-between">
            Rich Text Editor
            <Form.Check
              type="switch"
              id="rich-text-editor-debug-mode"
              label="Debug mode"
              checked={debugMode}
              onChange={(e) => setDebugMode(e.currentTarget.checked)}
            />
          </div>
        </Card.Header>
        <Card.Body>
          <div class="d-flex align-items-center gap-2 mb-2">
            <Button
              variant={
                editor.isActive('plPanel', { tag: 'pl-question-panel' }) ? 'primary' : 'light'
              }
              size="sm"
              title="Toggle Question Panel"
              onClick={() => editor.chain().focus().togglePanel('question').run()}
            >
              <i class="bi bi-question-square" aria-hidden="true" />
            </Button>
          </div>
          <div class="mb-3" />
          <EditorContent editor={editor} class="border" />
          <OverlayTrigger
            placement="left"
            overlay={<Tooltip id="drag-tooltip">Click for options</Tooltip>}
          >
            <div class="position-relative">
              <DragHandle editor={editor} computePositionConfig={{ placement: 'left' }}>
                <OverlayTrigger
                  placement="right"
                  trigger="click"
                  overlay={
                    <Popover id="visibility-menu">
                      <Popover.Header as="h3">Visibility</Popover.Header>
                      <Popover.Body>
                        <div class="d-flex flex-column gap-2">
                          <button
                            type="button"
                            class="btn btn-sm btn-light d-flex align-items-center gap-2"
                            onClick={() =>
                              editor.chain().focus().setPanelVisibility('question').run()
                            }
                          >
                            <i
                              class={`bi ${editor.isActive('plPanel', { tag: 'pl-question-panel' }) ? 'bi-check-square' : 'bi-square'}`}
                            />
                            In question
                          </button>
                          <button
                            type="button"
                            class="btn btn-sm btn-light d-flex align-items-center gap-2"
                            onClick={() =>
                              editor.chain().focus().setPanelVisibility('submission').run()
                            }
                          >
                            <i
                              class={`bi ${editor.isActive('plPanel', { tag: 'pl-submission-panel' }) ? 'bi-check-square' : 'bi-square'}`}
                            />
                            In submission
                          </button>
                          <button
                            type="button"
                            class="btn btn-sm btn-light d-flex align-items-center gap-2"
                            onClick={() =>
                              editor.chain().focus().setPanelVisibility('answer').run()
                            }
                          >
                            <i
                              class={`bi ${editor.isActive('plPanel', { tag: 'pl-answer-panel' }) ? 'bi-check-square' : 'bi-square'}`}
                            />
                            In answer
                          </button>
                          <button
                            type="button"
                            class="btn btn-sm btn-light d-flex align-items-center gap-2"
                            onClick={() =>
                              editor.chain().focus().setPanelVisibility('always').run()
                            }
                          >
                            <i
                              class={`bi ${editor.isActive('plPanel') ? 'bi-square' : 'bi-check-square'}`}
                            />
                            Always
                          </button>
                        </div>
                      </Popover.Body>
                    </Popover>
                  }
                  rootClose
                >
                  <i class="bi bi-grip-vertical" />
                </OverlayTrigger>
              </DragHandle>
            </div>
          </OverlayTrigger>
          {debugMode ? (
            <Card class="mt-3">
              <Card.Header>Formatted HTML</Card.Header>
              <Card.Body>
                <pre class="mb-0">
                  <code>{formattedHtml ?? ''}</code>
                </pre>
              </Card.Body>
            </Card>
          ) : null}
        </Card.Body>
        {/* <FloatingMenu editor={editor}>This is the floating menu</FloatingMenu> */}
        {/* <BubbleMenu editor={editor}>This is the bubble menu</BubbleMenu> */}
      </Card>
    </>
  );
};

RichTextEditor.displayName = 'RichTextEditor';
export default RichTextEditor;
