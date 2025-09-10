import DragHandle from '@tiptap/extension-drag-handle-react';
import { NodeSelection } from '@tiptap/pm/state';
import type { Editor } from '@tiptap/react';
import { useState } from 'preact/compat';
import { OverlayTrigger, Popover, Tooltip } from 'react-bootstrap';

import { panelMeta } from '../extensions/pl-panel.js';

export function DragHandleMenu({ editor }: { editor: Editor | null }) {
  const [showMenu, setShowMenu] = useState(false);
  const [lastPos, setLastPos] = useState<number | null>(null);
  if (editor === null) return null;

  const inQuestionPanel = editor.isActive('plPanel', { tag: 'pl-question-panel' });
  const inSubmissionPanel = editor.isActive('plPanel', { tag: 'pl-submission-panel' });
  const inAnswerPanel = editor.isActive('plPanel', { tag: 'pl-answer-panel' });
  const isInsidePanel = editor.isActive('plPanel');

  const tagActiveMap = {
    'pl-question-panel': inQuestionPanel,
    'pl-submission-panel': inSubmissionPanel,
    'pl-answer-panel': inAnswerPanel,
  };

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
            // https://discuss.prosemirror.net/t/difficulty-with-programmatically-unwrapping-lifting-blockquote-nodes-extended-with-nodeview-in-a-tiptap-prosemirror-editor-in-vue-js/5747/3
            // This ensures that the panel visibility applies to the correct node.
            const { state } = editor;
            if (pos != null && pos !== -1) {
              let lastPos = pos;
              try {
                // For elements with children, we need to select the next position.
                NodeSelection.create(state.doc, pos + 1);
              } catch {
                lastPos = pos;
              }
              setLastPos(lastPos);
            }
          }}
        >
          <OverlayTrigger
            placement="right"
            trigger="click"
            show={showMenu}
            overlay={
              <Popover id="visibility-menu">
                <Popover.Header as="h3">Visibility</Popover.Header>
                <Popover.Body>
                  <div class="d-flex flex-column gap-2">
                    {Object.entries(panelMeta).map(([tag, meta]) => (
                      <button
                        key={tag}
                        type="button"
                        class="btn btn-sm btn-light d-flex align-items-center gap-2"
                        onClick={() => {
                          if (!isInsidePanel) setShowMenu(false);
                          if (lastPos === null) return;
                          editor
                            .chain()
                            .setNodeSelection(lastPos)
                            .focus()
                            .togglePanelVisibility(tag as keyof typeof panelMeta)
                            .run();
                        }}
                      >
                        <i class={`bi ${tagActiveMap[tag] ? 'bi-check-square' : 'bi-square'}`} />
                        In {meta.name}
                      </button>
                    ))}
                    <button
                      type="button"
                      class="btn btn-sm btn-light d-flex align-items-center gap-2"
                      disabled={!isInsidePanel}
                      onClick={() => {
                        setShowMenu(false);
                        editor.chain().focus().togglePanelVisibility('always').run();
                      }}
                    >
                      <i class={`bi ${!isInsidePanel ? 'bi-check-square' : 'bi-square'}`} />
                      Always
                    </button>
                  </div>
                </Popover.Body>
              </Popover>
            }
            rootClose
            onToggle={(next) => setShowMenu(next)}
          >
            <i class="bi bi-grip-vertical" />
          </OverlayTrigger>
        </DragHandle>
      </div>
    </OverlayTrigger>
  );
}

export default DragHandleMenu;
