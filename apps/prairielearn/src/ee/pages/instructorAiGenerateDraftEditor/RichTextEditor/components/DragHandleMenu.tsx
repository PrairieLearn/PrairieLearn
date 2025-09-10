import DragHandle from '@tiptap/extension-drag-handle-react';
import { NodeSelection } from '@tiptap/pm/state';
import type { Editor } from '@tiptap/react';
import { useState } from 'preact/compat';
import { OverlayTrigger, Popover, Tooltip } from 'react-bootstrap';

import { panelMeta } from '../extensions/pl-panel.js';

export function DragHandleMenu({ editor }: { editor: Editor | null }) {
  const [showMenu, setShowMenu] = useState(false);
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
            // This ensures that the panel visibility applies to the correct node.
            const { state, view } = editor;
            if (pos != null && pos !== -1) {
              const nodeSelection = NodeSelection.create(state.doc, pos);
              console.log('nodeSelection', nodeSelection);
              view.dispatch(state.tr.setSelection(nodeSelection));
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
                          editor
                            .chain()
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
