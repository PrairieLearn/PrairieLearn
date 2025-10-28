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
      .map((part) => encodeURIComponent(part))
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

      /** @type {NodeListOf<HTMLElement>} */ (
        filePreview.querySelectorAll('.js-file-preview-item')
      ).forEach((item) => {
        const file = item.dataset.file;
        if (!file) return;
        const escapedFileName = escapePath(file);
        const path = `${submissionFilesUrl}/${escapedFileName}`;

        const infoMessage = /** @type {HTMLElement} */ (item.querySelector('.js-info-alert'));
        const errorMessage = /** @type {HTMLElement} */ (item.querySelector('.js-error-alert'));

        /**
         * @param {string} message
         */
        function showInfoMessage(message) {
          infoMessage.textContent = message;
          infoMessage.classList.remove('d-none');
        }

        /**
         * @param {string} message
         */
        function showErrorMessage(message) {
          errorMessage.textContent = message;
          errorMessage.classList.remove('d-none');
        }

        function hideErrorMessage() {
          errorMessage.classList.add('d-none');
        }

        const toggleShowPreviewText = /** @type {HTMLElement} */ (
          item.querySelector('.js-toggle-show-preview-text')
        );
        const toggleExpandPreviewText = /** @type {HTMLElement} */ (
          item.querySelector('.js-toggle-expand-preview-text')
        );

        const preview = /** @type {HTMLElement} */ (item.querySelector('.file-preview'));
        const container = /** @type {HTMLElement} */ (
          item.querySelector('.file-preview-container')
        );
        const notebookPreview = item.querySelector('.js-notebook-preview');
        const pre = /** @type {HTMLElement} */ (preview.querySelector('pre'));

        const downloadButton = /** @type {HTMLElement} */ (
          item.querySelector('.file-preview-download')
        );
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

        const expandButton = /** @type {HTMLElement} */ (
          item.querySelector('.file-preview-expand')
        );

        /**
         * @param {boolean} expanded
         */
        function updateExpandButton(expanded) {
          toggleExpandPreviewText.textContent = expanded ? 'Collapse' : 'Expand';
          const expandIcon = /** @type {HTMLElement} */ (expandButton.querySelector('.fa-expand'));
          const compressIcon = /** @type {HTMLElement} */ (
            expandButton.querySelector('.fa-compress')
          );
          if (expanded) {
            expandIcon.classList.add('d-none');
            compressIcon.classList.remove('d-none');
          } else {
            expandIcon.classList.remove('d-none');
            compressIcon.classList.add('d-none');
          }
        }

        /**
         * @param {boolean | undefined} [expanded]
         */
        function toggleExpanded(expanded) {
          const shouldExpand = expanded ?? !container.style.maxHeight;

          // The container has a class with a `max-height` set which will only take
          // effect if there is no `max-height` set via the `style` attribute.
          if (shouldExpand) {
            container.style.maxHeight = 'none';
            updateExpandButton(true);
          } else {
            container.style.removeProperty('max-height');
            updateExpandButton(false);
          }
        }

        expandButton.addEventListener('click', () => toggleExpanded());

        let wasOpened = false;

        $(preview).on('show.bs.collapse', () => {
          toggleShowPreviewText.textContent = 'Hide preview';

          if (wasOpened) return;

          const code = /** @type {HTMLElement} */ (preview.querySelector('code'));
          const img = /** @type {HTMLImageElement} */ (preview.querySelector('img'));
          const iframe = /** @type {HTMLIFrameElement} */ (preview.querySelector('iframe'));

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
                    // @ts-expect-error - notebookjs has no types
                    import('notebookjs'),
                    // MathJax needs to have been loaded before the extension can be used.
                    MathJax.startup.promise,
                  ]).then(([Marked, markedMathjax]) => {
                    // @ts-expect-error - addMathjaxExtension signature is complex
                    markedMathjax.addMathjaxExtension(Marked.marked, MathJax);
                    // @ts-expect-error - nb global is not well-typed
                    nb.markdown = Marked.marked.parse;

                    // @ts-expect-error - nb global is not well-typed
                    nb.sanitizer = /** @param {string} code */ (code) =>
                      DOMPurify.sanitize(code, { SANITIZE_NAMED_PROPS: true });
                    const notebook = nb.parse(JSON.parse(text));
                    const rendered = notebook.render();

                    if (notebookPreview) {
                      notebookPreview.append(rendered);
                      notebookPreview.classList.remove('d-none');
                    }

                    // Typeset any math that might be in the notebook.
                    if (notebookPreview) {
                      void window.MathJax.typesetPromise([notebookPreview]);
                    }
                  });
                } else {
                  code.textContent = text;
                  pre.classList.remove('d-none');
                }

                // Only show the expand/collapse button if the content is tall
                // enough where scrolling is necessary. This must be done before
                // auto-expansion happens below.
                if (container.scrollHeight > container.clientHeight) {
                  expandButton.classList.remove('d-none');
                }

                // Always fully expand notebook previews.
                if (escapedFileName.endsWith('.ipynb')) {
                  toggleExpanded(true);
                }
              } else if (type.startsWith('image/')) {
                const url = URL.createObjectURL(blob);
                img.src = url;
                img.onload = () => {
                  URL.revokeObjectURL(url);
                };
                img.classList.remove('d-none');
              } else if (type === 'application/pdf') {
                const url = URL.createObjectURL(blob);
                iframe.src = url;
                iframe.onload = () => {
                  URL.revokeObjectURL(url);
                };
                const pdfContainer = /** @type {HTMLElement} */ (
                  iframe.closest('.js-file-preview-pdf-container')
                );
                pdfContainer.classList.remove('d-none');
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
          toggleShowPreviewText.textContent = 'Show preview';
        });
      });
    }
  }

  // @ts-expect-error - TypeScript doesn't recognize PLFilePreview as a valid property
  window.PLFilePreview = PLFilePreview;
})();
