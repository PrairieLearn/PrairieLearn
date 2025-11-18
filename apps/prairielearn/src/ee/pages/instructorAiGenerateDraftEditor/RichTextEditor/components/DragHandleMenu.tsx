import DragHandle from '@tiptap/extension-drag-handle-react';
import { NodeSelection } from '@tiptap/pm/state';
import type { Editor } from '@tiptap/react';
import { useState } from 'preact/compat';
import { OverlayTrigger, Popover } from 'react-bootstrap';

import { panelMeta } from '../extensions/pl-panel.js';

// TODO: This doesn't actually handle dragging the node around yet.
// TODO: Improve hover region for the drag handle to make it easier to click.
// TODO: Make it more obvious that the drag handle is clickable (e.g. change the cursor to a pointer, tooltip)

export function DragHandleMenu({ editor }: { editor: Editor | null }) {
  const [showMenu, setShowMenu] = useState(false);
  const [lastPos, setLastPos] = useState<{ pos: number; offset: number } | null>(null);
  if (editor === null) return null;

  const node = lastPos !== null ? editor.$pos(lastPos.pos + lastPos.offset).node : null;
  const tagActiveMap = Object.fromEntries(
    Object.keys(panelMeta).map((tag) => {
      return [tag, node?.type.name === 'plPanel' && node.attrs.tag === tag];
    }),
  );

  const isInsidePanel = Object.values(tagActiveMap).some(Boolean);

  return (
    <DragHandle
      editor={editor}
      computePositionConfig={{ placement: 'left' }}
      onNodeChange={({ editor, pos }) => {
        // If the menu is shown, don't update the last position.
        if (showMenu) {
          return;
        }

        // Track the last node that was interacted with so that the panel visibility applies to the correct node.
        const { state } = editor;
        if (pos !== -1) {
          let offset = 1;
          try {
            // For elements with children, we need to select the next position for some reason.
            // See https://discuss.prosemirror.net/t/difficulty-with-programmatically-unwrapping-lifting-blockquote-nodes-extended-with-nodeview-in-a-tiptap-prosemirror-editor-in-vue-js/5747/3
            NodeSelection.create(state.doc, pos + 1);
          } catch {
            offset = 0;
          }
          setLastPos({ pos, offset });
        }
      }}
    >
      <OverlayTrigger
        placement="right"
        trigger="click"
        show={showMenu}
        overlay={
          <Popover id="drag-handle-menu-popover">
            <Popover.Header as="h3">Visibility</Popover.Header>
            <Popover.Body>
              {/* TODO: Potentially improve the styling of this. */}
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
                        .setNodeSelection(lastPos.pos + lastPos.offset)
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
                    // TODO: there should be a better way than using .focus() here.
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
  );
}
