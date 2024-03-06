/* eslint-env browser,jquery */

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

      filePreview.querySelectorAll('li').forEach((li) => {
        const file = li.dataset.file;
        const escapedFileName = escapePath(file);
        const path = `${submissionFilesUrl}/${escapedFileName}`;

        const errorMessage = li.querySelector('.alert.error');

        function showErrorMessage(message) {
          errorMessage.textContent = message;
          errorMessage.classList.remove('d-none');
        }

        function hideErrorMessage() {
          errorMessage.classList.add('d-none');
        }

        const toggleShowPreviewText = li.querySelector('.js-toggle-show-preview-text');
        const toggleExpandPreviewText = li.querySelector('.js-toggle-expand-preview-text');

        const preview = li.querySelector('.file-preview');
        const pre = preview.querySelector('pre');

        const downloadButton = li.querySelector('.file-preview-download');
        downloadButton.addEventListener('click', (event) => {
          // Prevent this click from toggling the collapse state.
          event.stopPropagation();

          downloadFile(path, file)
            .then(() => {
              hideErrorMessage();
            })
            .catch((err) => {
              console.error(err);
              showErrorMessage('An error occurred while downloading the file.');
            });
        });

        const expandButton = li.querySelector('.file-preview-expand');

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

        expandButton.addEventListener('click', () => {
          // The `<pre>` has a class with a `max-height` set which will only take
          // effect if there is no `max-height` set via the `style` attribute.
          if (pre.style.maxHeight) {
            pre.style.removeProperty('max-height');
            updateExpandButton(false);
          } else {
            pre.style.maxHeight = 'none';
            updateExpandButton(true);
          }
        });

        let wasOpened = false;

        $(preview).on('show.bs.collapse', () => {
          toggleShowPreviewText.textContent = 'Hide preview';

          if (wasOpened) return;

          const code = preview.querySelector('code');
          const img = preview.querySelector('img');

          fetch(path, { method: 'GET' })
            .then((result) => {
              if (!result.ok) {
                throw new Error(`Failed to download file: ${result.status}`);
              }
              return result.blob();
            })
            .then(async (blob) => {
              const type = blob.type;
              if (type === 'text/plain') {
                const text = await blob.text();
                code.textContent = text;
                pre.classList.remove('d-none');
                hideErrorMessage();

                // Only show the expand/collapse button if the content is tall
                // enough where scrolling is necessary.
                if (pre.scrollHeight > pre.clientHeight) {
                  expandButton.classList.remove('d-none');
                }
              } else if (type.startsWith('image/')) {
                const url = URL.createObjectURL(blob);
                img.src = url;
                img.onload = () => {
                  URL.revokeObjectURL(url);
                };
                img.classList.remove('d-none');
                hideErrorMessage();
              } else {
                // We can't preview this file.
                showErrorMessage('Content preview is not available for this type of file.');
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
