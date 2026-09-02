import * as cheerio from 'cheerio';
import * as csstree from 'css-tree';

export interface QuestionHtmlToNamespace {
  html: string;
  namespace: string;
}

const SINGLE_ID_REFERENCE_ATTRIBUTES = [
  'aria-activedescendant',
  'aria-details',
  'aria-errormessage',
  'for',
  'form',
  'list',
];
const ID_REFERENCE_LIST_ATTRIBUTES = [
  'aria-controls',
  'aria-describedby',
  'aria-flowto',
  'aria-labelledby',
  'aria-owns',
  'headers',
  'itemref',
];
const FRAGMENT_REFERENCE_ATTRIBUTES = [
  'data-bs-parent',
  'data-bs-target',
  'data-target',
  'href',
  'xlink:href',
];
const URL_REFERENCE_ATTRIBUTES = [
  'clip-path',
  'fill',
  'filter',
  'marker-end',
  'marker-mid',
  'marker-start',
  'mask',
  'stroke',
];

function rewriteCssIdReferences(
  css: string,
  context: 'declarationList' | 'stylesheet' | 'value',
  idRenames: ReadonlyMap<string, string>,
): string {
  if (!css.includes('#') || idRenames.size === 0) return css;

  const ast = csstree.parse(css, { context, parseCustomProperty: true });
  let changed = false;
  csstree.walk(ast, (node) => {
    if (node.type === 'IdSelector') {
      const renamedId = idRenames.get(csstree.ident.decode(node.name));
      if (renamedId) {
        node.name = csstree.ident.encode(renamedId);
        changed = true;
      }
    }
    if (node.type === 'Url' && node.value.startsWith('#')) {
      const renamedId = idRenames.get(node.value.slice(1));
      if (renamedId) {
        node.value = `#${renamedId}`;
        changed = true;
      }
    }
  });

  return changed ? csstree.generate(ast) : css;
}

function rewriteScriptIdReferences(scriptHtml: string, idRenames: ReadonlyMap<string, string>) {
  return scriptHtml
    .replaceAll(
      /\bgetElementById\(\s*(["'`])([^"'`]+)\1\s*\)/g,
      (call, quote: string, id: string) => {
        const renamedId = idRenames.get(id);
        return renamedId
          ? call.replace(`${quote}${id}${quote}`, `${quote}${renamedId}${quote}`)
          : call;
      },
    )
    .replaceAll(
      /\b(?:querySelector(?:All)?|closest|matches)\(\s*(["'`])#([^"'`]+)\1\s*\)/g,
      (call, quote: string, id: string) => {
        const renamedId = idRenames.get(id);
        return renamedId
          ? call.replace(`${quote}#${id}${quote}`, `${quote}#${renamedId}${quote}`)
          : call;
      },
    )
    .replaceAll(/\$\(\s*(["'`])#([^"'`]+)\1\s*\)/g, (call, quote: string, id: string) => {
      const renamedId = idRenames.get(id);
      return renamedId
        ? call.replace(`${quote}#${id}${quote}`, `${quote}#${renamedId}${quote}`)
        : call;
    });
}

function attributeSelector(attribute: string): string {
  return `[${attribute.replaceAll(':', '\\:')}]`;
}

function renameIdsAndReferences(
  $: cheerio.CheerioAPI,
  idRenames: ReadonlyMap<string, string>,
): void {
  $('[id]').each((_index, element) => {
    const id = $(element).attr('id');
    if (id && idRenames.has(id)) $(element).attr('id', idRenames.get(id));
  });

  for (const attribute of SINGLE_ID_REFERENCE_ATTRIBUTES) {
    $(attributeSelector(attribute)).each((_index, element) => {
      const value = $(element).attr(attribute);
      if (value && idRenames.has(value)) $(element).attr(attribute, idRenames.get(value));
    });
  }

  for (const attribute of ID_REFERENCE_LIST_ATTRIBUTES) {
    $(attributeSelector(attribute)).each((_index, element) => {
      const value = $(element).attr(attribute);
      if (!value) return;

      $(element).attr(
        attribute,
        value
          .split(/\s+/)
          .map((id) => idRenames.get(id) ?? id)
          .join(' '),
      );
    });
  }

  for (const attribute of FRAGMENT_REFERENCE_ATTRIBUTES) {
    $(attributeSelector(attribute)).each((_index, element) => {
      const value = $(element).attr(attribute);
      if (!value?.startsWith('#')) return;

      const renamedId = idRenames.get(value.slice(1));
      if (renamedId) $(element).attr(attribute, `#${renamedId}`);
    });
  }

  for (const attribute of URL_REFERENCE_ATTRIBUTES) {
    $(attributeSelector(attribute)).each((_index, element) => {
      const value = $(element).attr(attribute);
      if (!value) return;
      $(element).attr(attribute, rewriteCssIdReferences(value, 'value', idRenames));
    });
  }

  $('[style]').each((_index, element) => {
    const style = $(element).attr('style');
    if (style) {
      $(element).attr('style', rewriteCssIdReferences(style, 'declarationList', idRenames));
    }
  });

  $('style').each((_index, element) => {
    const stylesheet = $(element).html();
    if (stylesheet) {
      $(element).html(rewriteCssIdReferences(stylesheet, 'stylesheet', idRenames));
    }
  });

  $('script').each((_index, element) => {
    const scriptHtml = $(element).html();
    if (!scriptHtml) return;
    $(element).html(rewriteScriptIdReferences(scriptHtml, idRenames));
  });
}

function reserveUniqueBase(
  preferredBase: string,
  idsForBase: (base: string) => string[],
  reservedIds: Set<string>,
): string {
  let candidate = preferredBase;
  let suffix = 2;
  while (idsForBase(candidate).some((id) => reservedIds.has(id))) {
    candidate = `${preferredBase}-${suffix}`;
    suffix += 1;
  }
  for (const id of idsForBase(candidate)) reservedIds.add(id);
  return candidate;
}

function symbolicInputIds(name: string): string[] {
  return [`symbolic-input-${name}`, `symbolic-input-latex-${name}`, `symbolic-input-sub-${name}`];
}

function namespaceSymbolicInputs(
  $: cheerio.CheerioAPI,
  namespace: string,
  reservedIds: Set<string>,
): void {
  const symbolicInputNames = new Map<string, string>();

  $('script').each((_index, element) => {
    const scriptHtml = $(element).html();
    if (!scriptHtml) return;

    $(element).html(
      scriptHtml.replaceAll(
        /window\.PLSymbolicInput\(\s*(["'])([^"']+)\1\s*\)/g,
        (_call, quote: string, name: string) => {
          let namespacedName = symbolicInputNames.get(name);
          if (namespacedName === undefined) {
            namespacedName = reserveUniqueBase(
              `${namespace}-${name}`,
              symbolicInputIds,
              reservedIds,
            );
            symbolicInputNames.set(name, namespacedName);
          }
          return `window.PLSymbolicInput(${quote}${namespacedName}${quote})`;
        },
      ),
    );
  });

  const idRenames = new Map<string, string>();
  const nameRenames = new Map<string, string>();
  for (const [name, namespacedName] of symbolicInputNames) {
    const ids = symbolicInputIds(name);
    const namespacedIds = symbolicInputIds(namespacedName);
    ids.forEach((id, index) => idRenames.set(id, namespacedIds[index]));
    nameRenames.set(name, namespacedName);
    nameRenames.set(`${name}-latex`, `${namespacedName}-latex`);
  }
  renameIdsAndReferences($, idRenames);
  $('[name]').each((_index, element) => {
    const name = $(element).attr('name');
    const namespacedName = name ? nameRenames.get(name) : undefined;
    if (namespacedName) $(element).attr('name', namespacedName);
  });
}

function sketchInputIdsForBase(id: string): string[] {
  return [`${id}-si-container`, `${id}-sketchresponse-data`, `${id}-sketchresponse-submission`];
}

function namespaceSketchInputs(
  $: cheerio.CheerioAPI,
  namespace: string,
  reservedIds: Set<string>,
): void {
  const sketchInputNames = new Map<string, string>();

  $('script').each((_index, element) => {
    const scriptHtml = $(element).html();
    if (!scriptHtml) return;

    $(element).html(
      scriptHtml.replaceAll(
        /window\.SketchInput\(\s*(["'])([^"']+)\1/g,
        (_call, quote: string, id: string) => {
          let namespacedId = sketchInputNames.get(id);
          if (namespacedId === undefined) {
            namespacedId = reserveUniqueBase(
              `${namespace}-${id}`,
              sketchInputIdsForBase,
              reservedIds,
            );
            sketchInputNames.set(id, namespacedId);
          }
          return `window.SketchInput(${quote}${namespacedId}${quote}`;
        },
      ),
    );
  });

  const idRenames = new Map<string, string>();
  const nameRenames = new Map<string, string>();
  for (const [id, namespacedId] of sketchInputNames) {
    const ids = sketchInputIdsForBase(id);
    const namespacedIds = sketchInputIdsForBase(namespacedId);
    ids.forEach((inputId, index) => idRenames.set(inputId, namespacedIds[index]));
    nameRenames.set(`${id}-sketchresponse-submission`, `${namespacedId}-sketchresponse-submission`);
  }
  renameIdsAndReferences($, idRenames);
  $('[name]').each((_index, element) => {
    const name = $(element).attr('name');
    const namespacedName = name ? nameRenames.get(name) : undefined;
    if (namespacedName) $(element).attr('name', namespacedName);
  });
}

function getIds($: cheerio.CheerioAPI): string[] {
  const ids: string[] = [];
  $('[id]').each((_index, element) => {
    const id = $(element).attr('id');
    if (id) ids.push(id);
  });
  return ids;
}

function assertNoDuplicateIds($: cheerio.CheerioAPI, namespace: string): void {
  const seenIds = new Set<string>();
  const duplicateIds = new Set<string>();
  for (const id of getIds($)) {
    if (seenIds.has(id)) duplicateIds.add(id);
    seenIds.add(id);
  }
  if (duplicateIds.size > 0) {
    throw new Error(
      `Question HTML for namespace "${namespace}" contains duplicate IDs: ${[...duplicateIds].join(', ')}`,
    );
  }
}

function reserveUniqueId(preferredId: string, reservedIds: Set<string>): string {
  let candidate = preferredId;
  let suffix = 2;
  while (reservedIds.has(candidate)) {
    candidate = `${preferredId}-${suffix}`;
    suffix += 1;
  }
  reservedIds.add(candidate);
  return candidate;
}

/**
 * Namespaces IDs that occur in more than one question so that independently-rendered question
 * fragments can safely share a document. Formula-editor symbolic inputs and sketch inputs also
 * receive namespaced base names because their client initializers derive DOM IDs from those names.
 */
export function namespaceQuestionHtmls(questions: readonly QuestionHtmlToNamespace[]): string[] {
  const namespaces = questions.map((question) => question.namespace);
  if (new Set(namespaces).size !== namespaces.length) {
    throw new Error('Question HTML namespaces must be unique');
  }
  for (const namespace of namespaces) {
    if (!/^[A-Za-z][A-Za-z0-9_-]*$/.test(namespace)) {
      throw new Error(`Invalid question HTML namespace: ${namespace}`);
    }
  }

  const fragments = questions.map(({ html, namespace }) => {
    const $ = cheerio.load(html, undefined, false);
    assertNoDuplicateIds($, namespace);
    return { $, namespace };
  });

  const reservedIds = new Set(fragments.flatMap(({ $ }) => getIds($)));
  for (const { $, namespace } of fragments) {
    namespaceSymbolicInputs($, namespace, reservedIds);
    namespaceSketchInputs($, namespace, reservedIds);
    assertNoDuplicateIds($, namespace);
  }

  const idCounts = new Map<string, number>();
  for (const { $ } of fragments) {
    for (const id of getIds($)) idCounts.set(id, (idCounts.get(id) ?? 0) + 1);
  }

  for (const { $, namespace } of fragments) {
    const idRenames = new Map<string, string>();
    for (const id of getIds($)) {
      if ((idCounts.get(id) ?? 0) > 1) {
        idRenames.set(id, reserveUniqueId(`${namespace}-${id}`, reservedIds));
      }
    }
    renameIdsAndReferences($, idRenames);
    assertNoDuplicateIds($, namespace);
  }

  const finalIds = new Set<string>();
  for (const { $ } of fragments) {
    for (const id of getIds($)) {
      if (finalIds.has(id)) throw new Error(`Duplicate question HTML ID after namespacing: ${id}`);
      finalIds.add(id);
    }
  }

  return fragments.map(({ $ }) => $.root().html() ?? '');
}
