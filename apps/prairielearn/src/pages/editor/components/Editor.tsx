import { Blockquote } from '@tiptap/extension-blockquote';
import { Bold } from '@tiptap/extension-bold';
import { BulletList } from '@tiptap/extension-bullet-list';
import { Code } from '@tiptap/extension-code';
import { Document } from '@tiptap/extension-document';
import { Dropcursor } from '@tiptap/extension-dropcursor';
import { Gapcursor } from '@tiptap/extension-gapcursor';
import { HardBreak } from '@tiptap/extension-hard-break';
import { Heading } from '@tiptap/extension-heading';
import { Highlight } from '@tiptap/extension-highlight';
import { HorizontalRule } from '@tiptap/extension-horizontal-rule';
import { Italic } from '@tiptap/extension-italic';
import { ListItem, ListKeymap, OrderedList } from '@tiptap/extension-list';
import { Paragraph } from '@tiptap/extension-paragraph';
import { Strike } from '@tiptap/extension-strike';
import { Subscript } from '@tiptap/extension-subscript';
import { Superscript } from '@tiptap/extension-superscript';
import { TaskItem } from '@tiptap/extension-task-item';
import { TaskList } from '@tiptap/extension-task-list';
import { Text } from '@tiptap/extension-text';
import { TextAlign } from '@tiptap/extension-text-align';
import { Typography } from '@tiptap/extension-typography';
import { Underline } from '@tiptap/extension-underline';
import { UndoRedo } from '@tiptap/extensions';
import { EditorContent, EditorContext, useEditor } from '@tiptap/react';
import prettierHtmlPlugin from 'prettier/plugins/html';
import prettier from 'prettier/standalone';
import { useRef, useState } from 'react';
import { ButtonToolbar } from 'react-bootstrap';

import { Link } from '../../../components/tiptap-extension/link-extension.js';
import { PLCodeBlock } from '../../../components/tiptap-extension/pl-code-extension.js';
import { Selection } from '../../../components/tiptap-extension/selection-extension.js';
import { TrailingNode } from '../../../components/tiptap-extension/trailing-node-extension.js';
// import { formatHtmlWithPrettier } from '../../../lib/prettier.js';

import { ContextMenu, MainToolbarContent } from './Toolbar.js';
import { content } from './content.js';

function formatHtmlWithPrettier(html: string): Promise<string> {
  return prettier.format(html, {
    parser: 'html',
    plugins: [prettierHtmlPlugin],
    tabWidth: 2,
    printWidth: 100,
  });
}

export function Editor() {
  const toolbarRef = useRef<HTMLDivElement>(null);
  const [formattedHtml, setFormattedHtml] = useState<string | null>(null);

  const editor = useEditor({
    immediatelyRender: false,
    enableContentCheck: true,
    emitContentError: true,
    onContentError: (event) => {
      console.log('contentError', event);
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
      PLCodeBlock,
      Document,
      HardBreak,
      Heading,
      HorizontalRule,
      ListItem,
      OrderedList,
      Paragraph,
      Text,
      Bold,
      Code,
      Italic,
      Link,
      Strike,
      Underline,
      Dropcursor,
      Gapcursor,
      UndoRedo,
      ListKeymap,
      TrailingNode,
      TextAlign.configure({ types: ['heading', 'paragraph'] }),
      Underline,
      TaskList,
      TaskItem.configure({ nested: true }),
      Highlight.configure({ multicolor: true }),
      Typography,
      Superscript,
      Subscript,
      Selection,
      TrailingNode,
      Link.configure({ openOnClick: false }),
    ],
    content,
  });

  editor?.on('update', async () => {
    const formattedHtml = await formatHtmlWithPrettier(editor?.getHTML() ?? '');
    setFormattedHtml(formattedHtml);
  });

  editor?.on('contentError', (event) => {
    console.log('contentError', event);
  });

  return (
    // eslint-disable-next-line @eslint-react/no-unstable-context-value
    <EditorContext.Provider value={{ editor }}>
      <ButtonToolbar ref={toolbarRef}>
        <MainToolbarContent />
      </ButtonToolbar>
      <ContextMenu />

      <div
        style={{
          height: '100%',
          overflowY: 'auto',
          scrollbarWidth: 'thin',
        }}
      >
        <EditorContent
          editor={editor}
          role="presentation"
          style={{ maxWidth: '640px', width: '100%', margin: '0 auto' }}
        />
      </div>
      <pre>
        <code style={{ width: '100%', maxWidth: '640px', margin: '0 auto' }}>{formattedHtml}</code>
      </pre>
    </EditorContext.Provider>
  );
}

Editor.displayName = 'Editor';
