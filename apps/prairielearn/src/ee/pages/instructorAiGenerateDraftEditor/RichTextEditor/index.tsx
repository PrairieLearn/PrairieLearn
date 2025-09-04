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
import { UndoRedo } from '@tiptap/extensions';
import { EditorContent, useEditor } from '@tiptap/react';
import { BubbleMenu, FloatingMenu } from '@tiptap/react/menus';
import { useState } from 'preact/compat';
import prettierHtmlPlugin from 'prettier/plugins/html';
import prettier from 'prettier/standalone';

import { RawHtml } from './extensions/raw-html.js';

function formatHtmlWithPrettier(html: string): Promise<string> {
  return prettier.format(html, {
    parser: 'html',
    plugins: [prettierHtmlPlugin],
    tabWidth: 2,
    printWidth: 100,
  });
}

/**
 * The main rich text editor component.
 * @param params
 * @param params.htmlContents - The initial HTML contents of the editor.
 * @param params.csrfToken
 */
const RichTextEditor = ({
  htmlContents,
  csrfToken: _csrfToken,
}: {
  htmlContents: string | null;
  csrfToken: string;
}) => {
  const editor = useEditor({
    immediatelyRender: false,
    enableContentCheck: true,
    emitContentError: true,
    onContentError: (event) => {
      throw new Error(event.error.message);
    },
    editorProps: {
      attributes: {
        autocomplete: 'off',
        autocorrect: 'off',
        autocapitalize: 'off',
        'aria-label': 'Main content area, start typing to enter text.',
      },
    },
    extensions: [
      Blockquote,
      BulletList,
      Document,
      Heading,
      ListItem,
      OrderedList,
      Paragraph,
      Text,
      Bold,
      Code,
      Italic,
      Strike,
      Underline,
      Dropcursor,
      Gapcursor,
      UndoRedo,
      ListKeymap,
      Underline,
      Superscript,
      Subscript,
      RawHtml,
    ],
    content: htmlContents,
  });
  const [formattedHtml, setFormattedHtml] = useState<string | null>(null);

  if (htmlContents === null) {
    return null;
  }

  if (editor === null) {
    return null;
  }

  editor?.on('update', async () => {
    const formattedHtml = await formatHtmlWithPrettier(editor?.getHTML() ?? '');
    setFormattedHtml(formattedHtml);
  });

  return (
    <>
      <EditorContent editor={editor} />
      <FloatingMenu editor={editor}>This is the floating menu</FloatingMenu>
      <BubbleMenu editor={editor}>This is the bubble menu</BubbleMenu>
    </>
  );
};

RichTextEditor.displayName = 'RichTextEditor';
export { RichTextEditor };
