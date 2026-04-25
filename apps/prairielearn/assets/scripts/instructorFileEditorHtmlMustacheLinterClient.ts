import type ace from 'ace-builds';

import { attachHtmlMustacheLinter } from './lib/htmlMustacheLinter.js';

document.addEventListener('pl:html-mustache-linter-attach', ((e: Event) => {
  const event = e as CustomEvent<{ editor: ace.Ace.Editor }>;
  attachHtmlMustacheLinter({
    editor: event.detail.editor,
    beautifyButton: document.querySelector<HTMLButtonElement>('.js-beautify-html-mustache'),
  });
}) as EventListener);
