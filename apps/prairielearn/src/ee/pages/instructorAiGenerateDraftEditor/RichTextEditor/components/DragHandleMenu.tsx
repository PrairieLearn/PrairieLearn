import DragHandle from '@tiptap/extension-drag-handle-react';
import { NodeSelection } from '@tiptap/pm/state';
import type { Editor } from '@tiptap/react';
import { OverlayTrigger, Popover, Tooltip } from 'react-bootstrap';

export function DragHandleMenu({ editor }: { editor: Editor | null }) {
  if (editor === null) return null;

  const isQuestion = editor.isActive('plPanel', { tag: 'pl-question-panel' });
  const isSubmission = editor.isActive('plPanel', { tag: 'pl-submission-panel' });
  const isAnswer = editor.isActive('plPanel', { tag: 'pl-answer-panel' });
  const isInsidePanel = editor.isActive('plPanel');

  return (
    <OverlayTrigger
      placement="left"
      overlay={<Tooltip id="drag-tooltip">Click for options</Tooltip>}
    >
      <div class="position-relative">
        <DragHandle
          editor={editor}
          computePositionConfig={{ placement: 'left' }}
          onNodeChange={({ editor, pos }) => {
            // When a node changes, set the selection to the node.
            // This ensures that the panel visibility applies to the correct node.
            const { state, view } = editor;
            if (pos != null && pos !== -1) {
              view.dispatch(state.tr.setSelection(NodeSelection.create(state.doc, pos)));
            }
          }}
        >
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
                      onClick={() => editor.chain().focus().togglePanelVisibility('question').run()}
                    >
                      <i class={`bi ${isQuestion ? 'bi-check-square' : 'bi-square'}`} />
                      In question
                    </button>
                    <button
                      type="button"
                      class="btn btn-sm btn-light d-flex align-items-center gap-2"
                      onClick={() =>
                        editor.chain().focus().togglePanelVisibility('submission').run()
                      }
                    >
                      <i class={`bi ${isSubmission ? 'bi-check-square' : 'bi-square'}`} />
                      In submission
                    </button>
                    <button
                      type="button"
                      class="btn btn-sm btn-light d-flex align-items-center gap-2"
                      onClick={() => editor.chain().focus().togglePanelVisibility('answer').run()}
                    >
                      <i class={`bi ${isAnswer ? 'bi-check-square' : 'bi-square'}`} />
                      In answer
                    </button>
                    <button
                      type="button"
                      class="btn btn-sm btn-light d-flex align-items-center gap-2"
                      disabled={!isInsidePanel}
                      onClick={() => editor.chain().focus().togglePanelVisibility('always').run()}
                    >
                      <i class={`bi ${!isInsidePanel ? 'bi-check-square' : 'bi-square'}`} />
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
  );
}

export default DragHandleMenu;
