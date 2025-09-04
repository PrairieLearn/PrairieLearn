import { EditorContent, useEditor } from '@tiptap/react';
import { BubbleMenu, FloatingMenu } from '@tiptap/react/menus';
import StarterKit from '@tiptap/starter-kit';

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
    extensions: [StarterKit],
    content: htmlContents,
    immediatelyRender: false,
  });

  if (htmlContents === null) {
    return null;
  }

  if (editor === null) {
    return null;
  }

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
