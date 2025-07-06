/* global nb, DOMPurify, MathJax */
(() => {
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

  function escapePath(path) {
    return path
      .replace(/^\//, '')
      .split('/')
      .map((part) => encodeURIComponent(part))
      .join('/');
  }

  // eslint-disable-next-line @typescript-eslint/no-extraneous-class
  class PLFilePreview {
    constructor(uuid) {
      const filePreview = document.querySelector('#file-preview-' + uuid);
      const submissionFilesUrl = filePreview.dataset.submissionFilesUrl;

      filePreview.querySelectorAll('.js-file-preview-item').forEach((item) => {
        const file = item.dataset.file;
        const escapedFileName = escapePath(file);
        const path = `${submissionFilesUrl}/${escapedFileName}`;

        const infoMessage = item.querySelector('.js-info-alert');
        const errorMessage = item.querySelector('.js-error-alert');

        function showInfoMessage(message) {
          infoMessage.textContent = message;
          infoMessage.classList.remove('d-none');
        }

        function showErrorMessage(message) {
          errorMessage.textContent = message;
          errorMessage.classList.remove('d-none');
        }

        function hideErrorMessage() {
          errorMessage.classList.add('d-none');
        }

        const toggleShowPreviewText = item.querySelector('.js-toggle-show-preview-text');
        const toggleExpandPreviewText = item.querySelector('.js-toggle-expand-preview-text');

        const preview = item.querySelector('.file-preview');
        const container = item.querySelector('.file-preview-container');
        const notebookPreview = item.querySelector('.js-notebook-preview');
        const pre = preview.querySelector('pre');

        const downloadButton = item.querySelector('.file-preview-download');
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

        const expandButton = item.querySelector('.file-preview-expand');

        function updateExpandButton(expanded) {
          toggleExpandPreviewText.textContent = expanded ? 'Collapse' : 'Expand';
          if (expanded) {
            expandButton.querySelector('.fa-expand').classList.add('d-none');
            expandButton.querySelector('.fa-compress').classList.remove('d-none');
          } else {
            expandButton.querySelector('.fa-expand').classList.remove('d-none');
            expandButton.querySelector('.fa-compress').classList.add('d-none');
          }
        }

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
                    import('notebookjs'),
                    // MathJax needs to have been loaded before the extension can be used.
                    MathJax.startup.promise,
                  ]).then(async ([Marked, markedMathjax]) => {
                    markedMathjax.addMathjaxExtension(Marked.marked, MathJax);
                    nb.markdown = Marked.marked.parse;

                    nb.sanitizer = (code) =>
                      DOMPurify.sanitize(code, { SANITIZE_NAMED_PROPS: true });
                    const notebook = nb.parse(JSON.parse(text));
                    const rendered = notebook.render();

                    notebookPreview.appendChild(rendered);
                    notebookPreview.classList.remove('d-none');

                    // Typeset any math that might be in the notebook.
                    window.MathJax.typesetPromise([notebookPreview]);
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
                iframe.closest('.js-file-preview-pdf-container').classList.remove('d-none');
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

  window.PLFilePreview = PLFilePreview;
})();
