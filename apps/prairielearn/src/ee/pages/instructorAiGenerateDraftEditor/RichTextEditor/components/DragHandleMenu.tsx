import DragHandle from '@tiptap/extension-drag-handle-react';
import { NodeSelection } from '@tiptap/pm/state';
import type { Editor } from '@tiptap/react';
import { useState } from 'react';

import { OverlayTrigger } from '@prairielearn/ui';

import { panelMeta } from '../extensions/pl-panel.js';

// TODO: This doesn't actually handle dragging the node around yet.
// TODO: Improve hover region for the drag handle to make it easier to click.

export function DragHandleMenu({ editor }: { editor: Editor | null }) {
  const [menuTrigger, setMenuTrigger] = useState<'handle' | 'selection' | null>(null);
  const [lastPos, setLastPos] = useState<{ pos: number; offset: number } | null>(null);
  if (editor === null) return null;

  const node = lastPos !== null ? editor.$pos(lastPos.pos + lastPos.offset).node : null;
  const tagActiveMap = Object.fromEntries(
    Object.keys(panelMeta).map((tag) => [
      tag,
      menuTrigger === 'selection'
        ? editor.isActive('plPanel', { tag })
        : node?.type.name === 'plPanel' && node.attrs.tag === tag,
    ]),
  );
  const isInsidePanel = Object.values(tagActiveMap).some(Boolean);

  const popover = {
    header: <h3 className="h6 mb-0">Visibility</h3>,
    body: (
      <div className="d-flex flex-column gap-2">
        {Object.entries(panelMeta).map(([tag, meta]) => (
          <button
            key={tag}
            type="button"
            className="btn btn-sm btn-light d-flex align-items-center gap-2"
            aria-pressed={Boolean(tagActiveMap[tag])}
            onClick={() => {
              if (menuTrigger === 'selection') {
                setMenuTrigger(null);
                editor
                  .chain()
                  .focus()
                  .togglePanelVisibility(tag as keyof typeof panelMeta)
                  .run();
              } else {
                if (!isInsidePanel) setMenuTrigger(null);
                if (lastPos === null) return;
                editor
                  .chain()
                  .setNodeSelection(lastPos.pos + lastPos.offset)
                  .togglePanelVisibility(tag as keyof typeof panelMeta)
                  .run();
              }
            }}
          >
            <i
              className={`bi ${tagActiveMap[tag] ? 'bi-check-square' : 'bi-square'}`}
              aria-hidden="true"
            />
            In {meta.name}
          </button>
        ))}
        <button
          type="button"
          className="btn btn-sm btn-light d-flex align-items-center gap-2"
          aria-pressed={!isInsidePanel}
          disabled={!isInsidePanel}
          onClick={() => {
            // TODO: there should be a better way than using .focus() here.
            setMenuTrigger(null);
            editor.chain().focus().togglePanelVisibility('always').run();
          }}
        >
          <i
            className={`bi ${!isInsidePanel ? 'bi-check-square' : 'bi-square'}`}
            aria-hidden="true"
          />
          Always
        </button>
      </div>
    ),
  };

  return (
    <>
      <DragHandle
        editor={editor}
        computePositionConfig={{ placement: 'left' }}
        onNodeChange={({ editor, pos }) => {
          // If a menu is shown, don't update the last position.
          if (menuTrigger !== null) return;

          // Track the last node that was interacted with so that the panel visibility applies to the correct node.
          const { state } = editor;
          if (pos !== -1) {
            let offset = 1;
            try {
              // For elements with children, we need to select the next position for some reason.
              // See https://discuss.prosemirror.net/t/difficulty-with-programmatically-unwrapping-lifting-blockquote-nodes-extended-with-nodeview-in-tiptap-prosemirror-editor-in-vue-js/5747/3
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
          show={menuTrigger === 'handle'}
          popover={popover}
          rootClose
          onToggle={(next) => setMenuTrigger(next ? 'handle' : null)}
        >
          <button
            type="button"
            className="btn btn-sm btn-ghost"
            aria-label="Panel visibility options"
          >
            <i className="bi bi-grip-vertical" aria-hidden="true" />
          </button>
        </OverlayTrigger>
      </DragHandle>
      <div className="d-flex justify-content-end mt-2">
        <OverlayTrigger
          placement="left"
          trigger="click"
          show={menuTrigger === 'selection'}
          popover={popover}
          rootClose
          onToggle={(next) => setMenuTrigger(next ? 'selection' : null)}
        >
          <button type="button" className="btn btn-sm btn-ghost" disabled={!editor.isEditable}>
            <i className="bi bi-eye me-1" aria-hidden="true" />
            Panel visibility
          </button>
        </OverlayTrigger>
      </div>
    </>
  );
}
