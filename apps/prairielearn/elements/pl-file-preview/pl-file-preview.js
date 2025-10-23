/* global nb, DOMPurify, MathJax */
(() => {
  /**
   * @param {string} path
   * @param {string} name
   */
  async function downloadFile(path, name) {
    const result = await fetch(path, { method: 'GET' });
    if (!result.ok) {
      throw new Error(`Failed to download file: ${result.status}`);
    }
    const blob = await result.blob();
    const aElement = document.createElement('a');
    aElement.setAttribute('download', name);
    const href = URL.createObjectURL(blob);
    aElement.href = href;
    aElement.setAttribute('target', '_blank');
    aElement.click();
    URL.revokeObjectURL(href);
  }

  /**
   * @param {string} path
   */
  function escapePath(path) {
    return path
      .replace(/^\//, '')
      .split('/')
      .map(/** @param {string} part */ (part) => encodeURIComponent(part))
      .join('/');
  }

  // eslint-disable-next-line @typescript-eslint/no-extraneous-class
  class PLFilePreview {
    /**
     * @param {string} uuid
     */
    constructor(uuid) {
      const filePreview = /** @type {HTMLElement | null} */ (
        document.querySelector('#file-preview-' + uuid)
      );
      if (!filePreview) throw new Error(`File preview element not found: #file-preview-${uuid}`);
      const submissionFilesUrl = filePreview.dataset.submissionFilesUrl;
      if (!submissionFilesUrl) throw new Error('submissionFilesUrl not found');

      filePreview.querySelectorAll('.js-file-preview-item').forEach((item) => {
        const file = /** @type {HTMLElement} */ (item).dataset.file;
        if (!file) return;
        const escapedFileName = escapePath(file);
        const path = `${submissionFilesUrl}/${escapedFileName}`;

        const infoMessage = item.querySelector('.js-info-alert');
        const errorMessage = item.querySelector('.js-error-alert');

        /**
         * @param {string} message
         */
        function showInfoMessage(message) {
          if (infoMessage) {
            infoMessage.textContent = message;
            infoMessage.classList.remove('d-none');
          }
        }

        /**
         * @param {string} message
         */
        function showErrorMessage(message) {
          if (errorMessage) {
            errorMessage.textContent = message;
            errorMessage.classList.remove('d-none');
          }
        }

        function hideErrorMessage() {
          if (errorMessage) {
            errorMessage.classList.add('d-none');
          }
        }

        const toggleShowPreviewText = item.querySelector('.js-toggle-show-preview-text');
        const toggleExpandPreviewText = item.querySelector('.js-toggle-expand-preview-text');

        const preview = item.querySelector('.file-preview');
        const container = item.querySelector('.file-preview-container');
        const notebookPreview = item.querySelector('.js-notebook-preview');
        const pre = preview ? preview.querySelector('pre') : null;

        const downloadButton = item.querySelector('.file-preview-download');
        if (downloadButton) {
          downloadButton.addEventListener('click', () => {
            downloadFile(path, file)
              .then(() => {
                hideErrorMessage();
              })
              .catch((err) => {
                console.error(err);
                showErrorMessage('An error occurred while downloading the file.');
              });
          });
        }

        const expandButton = item.querySelector('.file-preview-expand');

        /**
         * @param {boolean} expanded
         */
        function updateExpandButton(expanded) {
          if (toggleExpandPreviewText) {
            toggleExpandPreviewText.textContent = expanded ? 'Collapse' : 'Expand';
          }
          if (expandButton) {
            const expandIcon = expandButton.querySelector('.fa-expand');
            const compressIcon = expandButton.querySelector('.fa-compress');
            if (expanded) {
              if (expandIcon) expandIcon.classList.add('d-none');
              if (compressIcon) compressIcon.classList.remove('d-none');
            } else {
              if (expandIcon) expandIcon.classList.remove('d-none');
              if (compressIcon) compressIcon.classList.add('d-none');
            }
          }
        }

        /**
         * @param {boolean | undefined} [expanded]
         */
        function toggleExpanded(expanded) {
          const containerElement = /** @type {HTMLElement | null} */ (container);
          const shouldExpand =
            expanded ?? (containerElement ? !containerElement.style.maxHeight : false);

          // The container has a class with a `max-height` set which will only take
          // effect if there is no `max-height` set via the `style` attribute.
          if (containerElement) {
            if (shouldExpand) {
              containerElement.style.maxHeight = 'none';
              updateExpandButton(true);
            } else {
              containerElement.style.removeProperty('max-height');
              updateExpandButton(false);
            }
          }
        }

        if (expandButton) {
          expandButton.addEventListener('click', () => toggleExpanded());
        }

        let wasOpened = false;

        if (preview) {
          $(preview).on('show.bs.collapse', () => {
            if (toggleShowPreviewText) {
              toggleShowPreviewText.textContent = 'Hide preview';
            }

            if (wasOpened) return;

            const code = preview.querySelector('code');
            const img = preview.querySelector('img');
            const iframe = preview.querySelector('iframe');

            fetch(path, { method: 'GET' })
              .then((result) => {
                if (!result.ok) {
                  throw new Error(`Failed to download file: ${result.status}`);
                }
                return result.blob();
              })
              .then(async (blob) => {
                hideErrorMessage();

                const type = blob.type;
                if (type === 'text/plain') {
                  const text = await blob.text();
                  if (escapedFileName.endsWith('.ipynb')) {
                    await Promise.all([
                      import('marked'),
                      import('@prairielearn/marked-mathjax'),
                      // importing DOMPurify sets the global variable `DOMPurify`.
                      import('dompurify'),
                      // importing the notebookjs library sets the global variable `nb`.
                      // @ts-ignore - notebookjs has no types
                      import('notebookjs'),
                      // MathJax needs to have been loaded before the extension can be used.
                      MathJax.startup.promise,
                    ]).then(async ([Marked, markedMathjax]) => {
                      // @ts-ignore - addMathjaxExtension signature is complex
                      markedMathjax.addMathjaxExtension(Marked.marked, MathJax);
                      // @ts-ignore - nb global is not well-typed
                      nb.markdown = Marked.marked.parse;

                      // @ts-ignore - nb global is not well-typed
                      nb.sanitizer = /** @param {string} code */ (code) =>
                        // @ts-ignore - DOMPurify global is declared but not typed correctly
                        DOMPurify.sanitize(code, { SANITIZE_NAMED_PROPS: true });
                      // @ts-ignore - nb global is not well-typed
                      const notebook = nb.parse(JSON.parse(text));
                      const rendered = notebook.render();

                      if (notebookPreview) {
                        notebookPreview.append(rendered);
                        notebookPreview.classList.remove('d-none');
                      }

                      // Typeset any math that might be in the notebook.
                      if (notebookPreview) {
                        window.MathJax.typesetPromise([notebookPreview]);
                      }
                    });
                  } else {
                    if (code) {
                      code.textContent = text;
                    }
                    if (pre) {
                      pre.classList.remove('d-none');
                    }
                  }

                  // Only show the expand/collapse button if the content is tall
                  // enough where scrolling is necessary. This must be done before
                  // auto-expansion happens below.
                  const containerElement = /** @type {HTMLElement | null} */ (container);
                  if (
                    containerElement &&
                    containerElement.scrollHeight > containerElement.clientHeight
                  ) {
                    if (expandButton) {
                      expandButton.classList.remove('d-none');
                    }
                  }

                  // Always fully expand notebook previews.
                  if (escapedFileName.endsWith('.ipynb')) {
                    toggleExpanded(true);
                  }
                } else if (type.startsWith('image/')) {
                  const url = URL.createObjectURL(blob);
                  if (img) {
                    img.src = url;
                    img.onload = () => {
                      URL.revokeObjectURL(url);
                    };
                    img.classList.remove('d-none');
                  }
                } else if (type === 'application/pdf') {
                  const url = URL.createObjectURL(blob);
                  if (iframe) {
                    iframe.src = url;
                    iframe.onload = () => {
                      URL.revokeObjectURL(url);
                    };
                    const pdfContainer = iframe.closest('.js-file-preview-pdf-container');
                    if (pdfContainer) {
                      pdfContainer.classList.remove('d-none');
                    }
                  }
                } else {
                  // We can't preview this file.
                  showInfoMessage('Content preview is not available for this type of file.');
                }
                wasOpened = true;
              })
              .catch((err) => {
                console.error(err);
                showErrorMessage('An error occurred while downloading the file.');
              });
          });

          $(preview).on('hide.bs.collapse', () => {
            if (toggleShowPreviewText) {
              toggleShowPreviewText.textContent = 'Show preview';
            }
          });
        }
      });
    }
  }

  // @ts-ignore - TypeScript doesn't recognize PLFilePreview as a valid property
  window.PLFilePreview = PLFilePreview;
})();
