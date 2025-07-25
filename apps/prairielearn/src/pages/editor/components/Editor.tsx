import { Highlight } from '@tiptap/extension-highlight';
import { Subscript } from '@tiptap/extension-subscript';
import { Superscript } from '@tiptap/extension-superscript';
import { TaskItem } from '@tiptap/extension-task-item';
import { TaskList } from '@tiptap/extension-task-list';
import { TextAlign } from '@tiptap/extension-text-align';
import { Typography } from '@tiptap/extension-typography';
import { Underline } from '@tiptap/extension-underline';
import { EditorContent, EditorContext, useEditor } from '@tiptap/react';
import { StarterKit } from '@tiptap/starter-kit';
import { useRef } from 'react';
import { ButtonToolbar } from 'react-bootstrap';

import { Link } from '../../../components/tiptap-extension/link-extension.js';
import { Selection } from '../../../components/tiptap-extension/selection-extension.js';
import { TrailingNode } from '../../../components/tiptap-extension/trailing-node-extension.js';

import { ContextMenu, MainToolbarContent } from './Toolbar.js';
import { content } from './content.js';

export function Editor() {
  const toolbarRef = useRef<HTMLDivElement>(null);

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
      Typography,
      Superscript,
      Subscript,
      Selection,
      TrailingNode,
      Link.configure({ openOnClick: false }),
    ],
    content,
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
    </EditorContext.Provider>
  );
}

Editor.displayName = 'Editor';
