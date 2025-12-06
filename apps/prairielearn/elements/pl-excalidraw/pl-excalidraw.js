// This module is redefined in the import map with the same name
// @ts-expect-error - no types available for this internal package
import { ExcalidrawLib, React, ReactDOM } from '@prairielearn/excalidraw-builds';

const elt = React.createElement;

/**
 * @param {{ unsaved: boolean; readOnly: boolean }} props
 */
const Footer = ({ unsaved, readOnly }) => {
  const desc = unsaved ? 'Unsaved' : 'Saved';
  return elt(
    ExcalidrawLib.Footer,
    null,
    readOnly
      ? null
      : elt(
          ExcalidrawLib.Button,
          {
            'aria-label': desc,
            type: 'button',
            disabled: true,
            title: desc,
            size: 'medium',
            className: unsaved ? 'save-button save-button-unsaved' : 'save-button',
          },
          desc,
        ),
  );
};

/**
 * @typedef {object} ExcalidrawMetadata
 * @property {boolean} read_only - Whether the drawing is read-only
 * @property {string} [initial_content] - Initial content for the drawing
 * @property {object} [scene] - The scene configuration
 * @property {string} width - The width of the drawing canvas
 * @property {string} height - The height of the drawing canvas
 */

/**
 * @typedef ExcalidrawAPI
 * @property {() => readonly ExcalidrawElement[]} getSceneElements - Gets the scene elements
 * @property {() => Record<string, unknown>} getAppState - Gets the app state
 * @property {() => Record<string, unknown>} getFiles - Gets the files
 */

/**
 * @typedef ExcalidrawElement
 * @property {number} version - The version of the element
 */

/**
 * @param {{ sketchName: string; metadata: ExcalidrawMetadata; setHiddenInput: (value: string) => void }} props
 */
const DrawWidget = ({ sketchName, metadata, setHiddenInput }) => {
  const [unsaved, setUnsaved] = React.useState(false);
  const [lib, setLib] = React.useState(/** @type {ExcalidrawAPI | null} */ (null));
  const [sceneVer, setSceneVer] = React.useState(0);

  // Autosave
  React.useEffect(() => {
    // No need to autosave a read-only element
    if (!lib || metadata.read_only) return;
    const autoSave = setTimeout(() => {
      setHiddenInput(
        ExcalidrawLib.serializeAsJSON(
          lib.getSceneElements(),
          lib.getAppState(),
          lib.getFiles(),
          'local',
        ),
      );
      setUnsaved(false);
    }, 250);
    return () => clearTimeout(autoSave);
  }, [setHiddenInput, metadata.read_only, lib, sceneVer]);

  const props = {
    name: sketchName,
    zenModeEnabled: false,
    aiEnabled: false,
    initialData: metadata.scene || {},
    isCollaborating: false,
    excalidrawAPI: /** @param {ExcalidrawAPI} it */ (it) => setLib(it),
    viewModeEnabled: metadata.read_only,
    onChange: /** @param {readonly ExcalidrawElement[]} elts */ (elts) => {
      const thisVersion = ExcalidrawLib.getSceneVersion(elts);
      if (sceneVer >= thisVersion) return;
      setUnsaved(true);
      setSceneVer(thisVersion);
    },
  };

  return elt(
    React.Fragment,
    null,
    elt(
      'div',
      { style: { width: metadata.width, height: metadata.height } },
      elt(
        ExcalidrawLib.Excalidraw,
        props,
        elt(
          ExcalidrawLib.MainMenu,
          null,
          elt(ExcalidrawLib.MainMenu.DefaultItems.ClearCanvas),
          elt(ExcalidrawLib.MainMenu.DefaultItems.Export),
          elt(ExcalidrawLib.MainMenu.DefaultItems.SaveAsImage),
        ),
        elt(Footer, { unsaved, readOnly: metadata.read_only }),
      ),
    ),
  );
};

/**
 * @typedef ReactRoot
 * @property {(element: unknown) => void} render - Renders the element
 */

/**
 * @param {string} uuid
 * @param {string} name
 * @param {ExcalidrawMetadata} metadata
 * @returns {Promise<{ name: string; state: null; node: HTMLElement | null; root: ReactRoot }>} - The initialized Excalidraw instance
 */
export async function initializeExcalidraw(uuid, name, metadata) {
  const rootElement = /** @type {HTMLElement} */ (document.getElementById(`excalidraw-${uuid}`));

  const hiddenInput = /** @type {HTMLInputElement} */ (
    document.getElementById(`excalidraw-input-${uuid}`)
  );
  /** @param {string} value */
  const setHiddenInput = (value) => {
    hiddenInput.value = value;
  };

  if (metadata.initial_content) {
    metadata.scene = await ExcalidrawLib.loadFromBlob(new Blob([metadata.initial_content]));
  }

  const root = ReactDOM.createRoot(rootElement);
  root.render(
    elt(
      React.StrictMode,
      null,
      elt(DrawWidget, {
        sketchName: name,
        metadata,
        setHiddenInput,
      }),
    ),
  );

  return {
    name,
    state: null,
    node: rootElement,
    root,
  };
}
