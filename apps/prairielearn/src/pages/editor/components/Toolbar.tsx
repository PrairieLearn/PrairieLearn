import { BubbleMenu } from '@tiptap/react/menus';
import { ButtonGroup } from 'react-bootstrap';

import { Spacer } from '../../../components/bootstrap-ui-primitive/spacer/index.js';
import { BlockquoteButton } from '../../../components/tiptap-ui/blockquote-button/index.js';
import { CodeBlockButton } from '../../../components/tiptap-ui/code-block-button/index.js';
import { ColorHighlightPopover } from '../../../components/tiptap-ui/color-highlight-popover/index.js';
import { HeadingDropdownMenu } from '../../../components/tiptap-ui/heading-dropdown-menu/index.js';
import { LinkPopover } from '../../../components/tiptap-ui/link-popover/index.js';
import { ListDropdownMenu } from '../../../components/tiptap-ui/list-dropdown-menu/index.js';
import { MarkButton } from '../../../components/tiptap-ui/mark-button/index.js';
import { QuestionPanelButton } from '../../../components/tiptap-ui/question-panel-button/index.js';
import { TextAlignButton } from '../../../components/tiptap-ui/text-align-button/index.js';
import { UndoRedoButton } from '../../../components/tiptap-ui/undo-redo-button/index.js';
import { useTiptapEditor } from '../../../lib/hooks/use-tiptap-editor.js';

export const MainToolbarContent = () => {
  return (
    <>
      <Spacer />

      <ButtonGroup>
        <UndoRedoButton action="undo" />
        <UndoRedoButton action="redo" />
      </ButtonGroup>

      <ButtonGroup>
        <HeadingDropdownMenu levels={[1, 2, 3, 4]} />
        <ListDropdownMenu types={['bulletList', 'orderedList', 'taskList']} />
        <BlockquoteButton />
        <CodeBlockButton />
        <QuestionPanelButton />
      </ButtonGroup>

      <ButtonGroup>
        <TextAlignButton align="left" />
        <TextAlignButton align="center" />
        <TextAlignButton align="right" />
        <TextAlignButton align="justify" />
      </ButtonGroup>

      <Spacer />
    </>
  );
};

// Picks up editor from context provider
export const ContextMenu = () => {
  const editor = useTiptapEditor();
  if (!editor) return null;

  return (
    <BubbleMenu editor={editor} options={{ placement: 'top', offset: 8 }}>
      <ButtonGroup className="bg-white">
        <MarkButton type="bold" />
        <MarkButton type="italic" />
        <MarkButton type="strike" />
        <MarkButton type="underline" />
        <MarkButton type="code" />
        <MarkButton type="superscript" />
        <MarkButton type="subscript" />
        <ColorHighlightPopover />
        <LinkPopover />
      </ButtonGroup>
    </BubbleMenu>
  );
};
