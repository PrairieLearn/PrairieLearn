/* eslint perfectionist/sort-sets: error */

import { Blockquote } from '@tiptap/extension-blockquote';
import { Bold } from '@tiptap/extension-bold';
import { BulletList } from '@tiptap/extension-bullet-list';
import { Code } from '@tiptap/extension-code';
import { Document } from '@tiptap/extension-document';
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
import prettierHtmlPlugin from 'prettier/plugins/html';
import prettier from 'prettier/standalone';
import { useEffect, useState } from 'react';
import { Card, Form } from 'react-bootstrap';

import { DragHandleMenu } from './components/DragHandleMenu.js';
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
 * @param params.isGenerating - Whether AI generation is in progress
 */
const RichTextEditor = ({
  csrfToken: _csrfToken,
  htmlContents,
  isGenerating,
}: {
  htmlContents: string | null;
  csrfToken: string;
  isGenerating: boolean;
}) => {
  const editor = useEditor({
    editable: !isGenerating,
    parseOptions: {
      // TODO: we basically want the parser to collapse whitespace per HTML's rules, except in Raw HTML blocks
      preserveWhitespace: true, // 'full',
    },
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
      const rawHtml = editor.getHTML();
      const formattedHtml = await formatHtmlWithPrettier(rawHtml);
      setRawHtml(rawHtml);
      setFormattedHtml(formattedHtml);
    },
    onUpdate: async ({ editor }) => {
      const rawHtml = editor.getHTML();
      const formattedHtml = await formatHtmlWithPrettier(rawHtml);
      setRawHtml(rawHtml);
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
  const [rawHtml, setRawHtml] = useState<string | null>(null);
  const [debugMode, setDebugMode] = useState<boolean>(false);

  // Sync `isGenerating` to editor editable state.
  useEffect(() => {
    if (editor) {
      // Shut up linter. This is how we have to do this. `useEditor` doesn't react
      // to changes in the `editable` option after initialization.
      // eslint-disable-next-line react-you-might-not-need-an-effect/no-pass-data-to-parent, react-you-might-not-need-an-effect/no-derived-state
      editor.setEditable(!isGenerating);
    }
  }, [editor, isGenerating]);

  if (htmlContents === null) {
    return null;
  }

  if (editor === null) {
    return null;
  }

  return (
    <>
      <Card className="m-3">
        <Card.Header>
          <div className="d-flex align-items-center justify-content-between">
            Rich text editor
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
          {isGenerating && (
            <div className="alert alert-info mb-3 py-2 d-flex align-items-center" role="alert">
              <div className="spinner-border spinner-border-sm me-2" role="status">
                <span className="visually-hidden">Loading...</span>
              </div>
              Editor is read-only while generation is in progress
            </div>
          )}
          <div className="d-flex align-items-center gap-2 mb-2" />
          <div className="mb-3" />
          <EditorContent editor={editor} className="border" />
          <DragHandleMenu editor={editor} />
          {debugMode && (
            <>
              <Card className="mt-3">
                <Card.Header>Formatted HTML</Card.Header>
                <Card.Body>
                  <pre className="mb-0">
                    <code>{formattedHtml ?? ''}</code>
                  </pre>
                </Card.Body>
              </Card>
              <Card className="mt-3">
                <Card.Header>Internal HTML</Card.Header>
                <Card.Body>
                  <pre className="mb-0">
                    <code>{rawHtml ?? ''}</code>
                  </pre>
                </Card.Body>
              </Card>
            </>
          )}
        </Card.Body>
        {/* <FloatingMenu editor={editor}>This is the floating menu</FloatingMenu> */}
        {/* <BubbleMenu editor={editor}>This is the bubble menu</BubbleMenu> */}
      </Card>
    </>
  );
};

RichTextEditor.displayName = 'RichTextEditor';
export default RichTextEditor;
