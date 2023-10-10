/* eslint-env browser */
/* global Viz */

window.PLFileEditor.prototype.preview.dot = new Promise((resolve) => {
  Viz.instance().then((viz) =>
    resolve((value) => {
      try {
        return viz.renderString(value, { format: 'svg' });
      } catch (err) {
        return `<span class="text-danger">${err.message}</span>`;
      }
    }),
  );
});
