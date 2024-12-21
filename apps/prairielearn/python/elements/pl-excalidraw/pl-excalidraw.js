/* eslint-env browser */

// This module is redefined in the import map with the same name
import { ExcalidrawLib, React, ReactDOM } from '@prairielearn/excalidraw-builds';

const elt = React.createElement;

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

const DrawWidget = ({ sketchName, metadata, setHiddenInput }) => {
  const [readOnly, setReadOnly] = React.useState(false);
  const [unsaved, setUnsaved] = React.useState(false);
  const [lib, setLib] = React.useState(null);
  const [sceneVer, setSceneVer] = React.useState(0);

  // First time setup
  React.useEffect(() => {
    setReadOnly(metadata.read_only);
  }, [metadata]);

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
  }, [setHiddenInput, lib, sceneVer]);

  const props = {
    name: sketchName,
    zenModeEnabled: false,
    aiEnabled: false,
    initialData: metadata.scene || {},
    isCollaborating: false,
    excalidrawAPI: (it) => setLib(it),
    viewModeEnabled: readOnly,
    onChange: (elts) => {
      let thisVersion = ExcalidrawLib.getSceneVersion(elts);
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
        elt(Footer, { unsaved, readOnly }),
      ),
    ),
  );
};

export async function initializeExcalidraw(uuid, name, metadata) {
  const sketch = {};

  const rootElement = document.getElementById(`excalidraw-${uuid}`);

  const hiddenInput = document.getElementById(`excalidraw-input-${uuid}`);
  const setHiddenInput = (value) => (hiddenInput.value = value);

  if (metadata.initial_content) {
    metadata.scene = await ExcalidrawLib.loadFromBlob(new Blob([metadata.initial_content]));
  }

  sketch.name = name;
  sketch.state = null;
  sketch.node = rootElement;
  sketch.root = ReactDOM.createRoot(rootElement);
  sketch.root.render(
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

  return sketch;
}
