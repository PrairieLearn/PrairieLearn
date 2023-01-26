/* eslint-env browser,jquery */

(() => {
  async function downloadFile(path, name) {
    const result = await fetch(path, { method: 'GET' });
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

  class PLFilePreview {
    constructor(uuid) {
      const filePreview = document.querySelector('#file-preview-' + uuid);
      const submissionFilesUrl = filePreview.dataset.submissionFilesUrl;

      filePreview.querySelectorAll('li').forEach((li) => {
        const file = li.dataset.file;
        const escapedFileName = escapePath(file);
        const path = `${submissionFilesUrl}/${escapedFileName}`;

        const downloadButton = li.querySelector('.file-preview-download-file');
        downloadButton.addEventListener('click', (event) => {
          event.stopPropagation();
          downloadFile(path, file).catch((err) => {
            // TODO: handle error
            console.error(err);
          });
        });

        let wasOpened = false;
        const preview = li.querySelector('.file-preview');
        $(preview).on('show.bs.collapse', () => {
          if (wasOpened) return;
          wasOpened = true;
          const pre = preview.querySelector('pre');
          const code = preview.querySelector('code');
          const img = preview.querySelector('img');

          fetch(path, { method: 'GET' })
            .then((result) => result.blob())
            .then(async (blob) => {
              const type = blob.type;
              if (type === 'text/plain') {
                const text = await blob.text();
                code.textContent = text;
                pre.classList.remove('d-none');
              } else if (type.startsWith('image/')) {
                const url = URL.createObjectURL(blob);
                img.src = url;
                img.onload = () => {
                  URL.revokeObjectURL(url);
                };
                img.classList.remove('d-none');
              } else {
                // We can't preview this file.
                code.textContent = 'Content preview is not available for this type of file.';
                pre.classList.remove('d-none');
              }
            })
            .catch((err) => {
              // TODO: handle error
              console.error(err);
            });
        });
      });
    }
  }

  window.PLFilePreview = PLFilePreview;
})();
