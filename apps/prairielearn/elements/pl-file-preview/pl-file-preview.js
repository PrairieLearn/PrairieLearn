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

        const downloadButton = li.querySelector('.file-preview-download-file');
        downloadButton.addEventListener('click', (event) => {
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

        let wasOpened = false;
        const preview = li.querySelector('.file-preview');
        $(preview).on('show.bs.collapse', () => {
          if (wasOpened) return;
          const pre = preview.querySelector('pre');
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
      });
    }
  }

  window.PLFilePreview = PLFilePreview;
})();
