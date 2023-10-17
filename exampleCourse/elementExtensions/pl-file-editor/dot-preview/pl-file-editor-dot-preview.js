/* eslint-env browser */
/* global Viz */

window.PLFileEditor.prototype.preview.dot = (() => {
  let vizPromise = null;
  return async (value) => {
    try {
      // Only load/create instance on first call.
      if (vizPromise == null) {
        vizPromise = (async () => {
          // TODO Dynamically load @viz-js/viz/lib/viz-standalone.js
          return await Viz.instance();
        })();
      }
      const viz = await vizPromise;
      return viz.renderString(value, { format: 'svg' });
    } catch (err) {
      return `<span class="text-danger">${err.message}</span>`;
    }
  };
})();
