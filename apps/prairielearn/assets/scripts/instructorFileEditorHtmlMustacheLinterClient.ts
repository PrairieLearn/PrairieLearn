import type ace from 'ace-builds';

import { attachHtmlMustacheLinter } from './lib/htmlMustacheLinter.js';

document.addEventListener('pl:html-mustache-linter-attach', (e: Event) => {
  const event = e as CustomEvent<{ editor: ace.Ace.Editor; onReformatError: () => void }>;
  attachHtmlMustacheLinter({
    editor: event.detail.editor,
    reformatButton: document.querySelector<HTMLButtonElement>('.js-reformat-html-mustache'),
    onReformatError: event.detail.onReformatError,
  });
});
