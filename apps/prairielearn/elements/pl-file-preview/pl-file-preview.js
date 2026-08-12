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
export default class PLFilePreview {
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
      let isLoading = false;

      preview.addEventListener('show.bs.collapse', () => {
        toggleShowPreviewText.textContent = 'Hide preview';

        if (wasOpened || isLoading) return;
        isLoading = true;

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
                  import('ansi_up'),
                  // importing DOMPurify sets the global variable `DOMPurify`.
                  import('dompurify'),
                  // importing the notebookjs library sets the global variable `nb`.
                  import('notebookjs'),
                  // MathJax needs to have been loaded before the extension can be used.
                  window.MathJax.startup.promise,
                ])
                  .then(async ([Marked, markedMathjax, { AnsiUp }]) => {
                    markedMathjax.addMathjaxExtension(Marked.marked, window.MathJax);
                    window.nb.markdown = Marked.marked.parse;
                    // The notebookjs double-escapes ANSI output
                    // (https://github.com/jsvine/notebookjs/issues/59). We can
                    // work around this by "unescaping" the text. This has the
                    // side-effect of also unescaping any `&gt;` and `&lt;` HTML
                    // entities that were originally in the text (since
                    // notebookjs doesn't escape ampersand and we can't
                    // distinguish between the original and the escaped
                    // versions), but these are less common than < and >
                    // characters in typical notebook output, so we'll accept
                    // that tradeoff for now.
                    window.nb.ansi = (code) => {
                      // Use a new instance of AnsiUp each time to avoid state from previous calls affecting the current call.
                      const ansiUp = new AnsiUp();
                      return ansiUp.ansi_to_html(
                        code.replaceAll('&gt;', '>').replaceAll('&lt;', '<'),
                      );
                    };
                    window.nb.sanitizer = (code) => window.DOMPurify.sanitize(code);

                    const notebook = window.nb.parse(JSON.parse(text));
                    const rendered = notebook.render();

                    const nbStyle = new CSSStyleSheet();
                    await nbStyle.replace(
                      await fetch(import.meta.resolve('pl-file-preview/notebook.css')).then(
                        // If the fetch fails, return an empty string to avoid breaking the preview.
                        (res) => res.text(),
                        () => '',
                      ),
                    );
                    const shadowRootStyles = [nbStyle];

                    const mjxStyles = window.MathJax.svgStylesheet();
                    if (mjxStyles) {
                      const style = new CSSStyleSheet();
                      await style.replace(mjxStyles.textContent);
                      shadowRootStyles.push(style);
                    }

                    const shadowRoot =
                      notebookPreview.shadowRoot || notebookPreview.attachShadow({ mode: 'open' });
                    shadowRoot.innerHTML = '';
                    shadowRoot.adoptedStyleSheets = shadowRootStyles;
                    shadowRoot.append(rendered);
                    notebookPreview.classList.remove('d-none');

                    // Typeset any math that might be in the notebook. Don't
                    // await as the page is still usable while MathJax is
                    // typesetting.
                    window.MathJax.typesetPromise(shadowRoot.children);
                  })
                  .catch((err) => {
                    console.error('An error occurred while rendering the notebook preview.', err);
                    // If an error occurs while rendering the notebook, we fall
                    // back to showing the raw text.
                    code.textContent = text;
                    pre.classList.remove('d-none');
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
          })
          .finally(() => {
            isLoading = false;
          });
      });

      preview.addEventListener('hide.bs.collapse', () => {
        toggleShowPreviewText.textContent = 'Show preview';
      });
    });
  }
}
