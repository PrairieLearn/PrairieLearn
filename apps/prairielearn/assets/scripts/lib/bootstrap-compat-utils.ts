import { observe } from 'selector-observer';
import SelectorSet from 'selector-set';

import { onDocumentReady } from '@prairielearn/browser-utils';

const compatEnabled =
  document.head.querySelector('meta[name="bootstrap-version"]')?.getAttribute('content') !== '4';

interface MigratorUtils {
  addClass(el: Element, newClass: string | string[], message: string): void;
  migrateClass(el: Element, oldClass: string, newClass: string): void;
  migrateAttribute(el: Element, oldAttribute: string, newAttribute: string): void;
}

interface MigratorOptions {
  selector: string;
  migrate: (el: Element, utils: MigratorUtils) => void;
}

const set = new SelectorSet<MigratorOptions>();

onDocumentReady(() => {
  const mutationObserver = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      if (mutation.type === 'attributes') {
        const el = mutation.target as Element;
        for (const migrator of set.matches(el)) {
          migrator.data.migrate(el, {
            addClass,
            migrateClass,
            migrateAttribute,
          });
        }
      }
    }
  });
  mutationObserver.observe(window.document, {
    attributes: true,
    childList: true,
    subtree: true,
  });
});

export function isBootstrapCompatEnabled() {
  return compatEnabled;
}

export function makeMigrator(options: MigratorOptions) {
  observe(options.selector, {
    add(el) {
      options.migrate(el, {
        addClass,
        migrateClass,
        migrateAttribute,
      });
    },
  });

  // `selector-observer` doesn't handle mutations to existing nodes, so we need
  // to use our own `MutationObserver` to handle this case.
  set.add(options.selector, options);
}

function addClass(el: Element, newClass: string | string[], message: string) {
  const newClasses = Array.isArray(newClass) ? newClass : [newClass];

  let didAddClass = false;
  newClasses.forEach((newClass) => {
    if (!el.classList.contains(newClass)) {
      el.classList.add(newClass);
      didAddClass = true;
    }
  });

  if (didAddClass) {
    console.warn(message, el);
  }
}

function migrateClass(el: Element, oldClass: string, newClass: string) {
  if (el.classList.contains(oldClass) && !el.classList.contains(newClass)) {
    el.classList.add(newClass);

    // TODO: customizable message?
    console.warn(
      `Bootstrap 5 replaced .${oldClass} with .${newClass}. Please update your HTML.`,
      el,
    );
  }
}

function migrateAttribute(el: Element, oldAttribute: string, newAttribute: string) {
  if (el.hasAttribute(oldAttribute) && !el.hasAttribute(newAttribute)) {
    el.setAttribute(newAttribute, el.getAttribute(oldAttribute) as string);

    // TODO: customizable message?
    console.warn(
      `Bootstrap 5 replaced ${oldAttribute} with ${newAttribute}. Please update your HTML.`,
      el,
    );
  }
}
