import { observe } from 'selector-observer';
import SelectorSet from 'selector-set';

import { onDocumentReady } from '@prairielearn/browser-utils';

export interface MigratedClass {
  oldClass: string;
  newClass: string;
}

export interface MigratedAttribute {
  oldAttribute: string;
  newAttribute: string;
}

export interface ClassMigratorOptions {
  selector: string;
  getMigratedClasses: (el: Element) => MigratedClass[];
}

export interface AttributeMigratorOptions {
  selector: string;
  getMigratedAttributes: (el: Element) => MigratedAttribute[];
}

type Migrator = (el: Element) => void;

const set = new SelectorSet<Migrator>();

onDocumentReady(() => {
  const mutationObserver = new MutationObserver(handleMutations);
  mutationObserver.observe(window.document, {
    attributes: true,
    childList: true,
    subtree: true,
  });
});

function handleMutations(mutations: MutationRecord[]) {
  for (const mutation of mutations) {
    if (mutation.type === 'attributes') {
      const el = mutation.target as Element;
      for (const migrator of set.matches(el)) {
        migrator.data(el);
      }
    }
  }
}

function applyMigratedClasses(el: Element, migratedClasses: MigratedClass[]) {
  for (const { oldClass, newClass } of migratedClasses) {
    if (el.classList.contains(oldClass) && !el.classList.contains(newClass)) {
      el.classList.add(newClass);

      // TODO: customizable message?
      console.warn(
        `Bootstrap 5 replaced .${oldClass} with .${newClass}. Please update your HTML.`,
        el,
      );
    }
  }
}

function applyMigratedAttributes(el: Element, migratedAttributes: MigratedAttribute[]) {
  for (const { oldAttribute, newAttribute } of migratedAttributes) {
    if (el.hasAttribute(oldAttribute) && !el.hasAttribute(newAttribute)) {
      el.setAttribute(newAttribute, el.getAttribute(oldAttribute) as string);

      // TODO: customizable message?
      console.warn(
        `Bootstrap 5 replaced ${oldAttribute} with ${newAttribute}. Please update your HTML.`,
        el,
      );
    }
  }
}

export function makeClassMigrator(options: ClassMigratorOptions) {
  observe(options.selector, {
    add(el) {
      const migratedClasses = options.getMigratedClasses(el);
      applyMigratedClasses(el, migratedClasses);
    },
  });

  // `selector-observer` doesn't handle mutations to existing nodes, so we need
  // to use our own `MutationObserver` to handle this case.
  set.add(options.selector, (el) => {
    const migratedClasses = options.getMigratedClasses(el);
    applyMigratedClasses(el, migratedClasses);
  });
}

export function makeAttributeMigrator(options: AttributeMigratorOptions) {
  observe(options.selector, {
    add(el) {
      const migratedAttributes = options.getMigratedAttributes(el);
      applyMigratedAttributes(el, migratedAttributes);
    },
  });

  // `selector-observer` doesn't handle mutations to existing nodes, so we need
  // to use our own `MutationObserver` to handle this case.
  set.add(options.selector, (el) => {
    const migratedAttributes = options.getMigratedAttributes(el);
    applyMigratedAttributes(el, migratedAttributes);
  });
}
