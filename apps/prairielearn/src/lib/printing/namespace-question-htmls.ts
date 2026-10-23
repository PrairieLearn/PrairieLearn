import { type Expression, parse } from 'acorn';
import { simple } from 'acorn-walk';
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
  context: 'declarationList' | 'selectorList' | 'stylesheet' | 'value',
  idRenames: ReadonlyMap<string, string>,
): string {
  if (!css.includes('#') || css.includes('${') || idRenames.size === 0) return css;

  const state = { parseError: false, changed: false };
  let ast: csstree.CssNode;
  try {
    ast = csstree.parse(css, {
      context,
      parseCustomProperty: true,
      onParseError: () => {
        state.parseError = true;
      },
    });
  } catch {
    return css;
  }
  if (state.parseError) return css;

  csstree.walk(ast, (node) => {
    if (node.type === 'IdSelector') {
      const renamedId = idRenames.get(csstree.ident.decode(node.name));
      if (renamedId) {
        node.name = csstree.ident.encode(renamedId);
        state.changed = true;
      }
    }
    if (node.type === 'Url' && node.value.startsWith('#')) {
      const renamedId = idRenames.get(node.value.slice(1));
      if (renamedId) {
        node.value = `#${renamedId}`;
        state.changed = true;
      }
    }
  });

  return state.changed ? csstree.generate(ast) : css;
}

function literalString(argument: Expression): string | null {
  if (argument.type === 'Literal' && typeof argument.value === 'string') return argument.value;
  if (argument.type === 'TemplateLiteral' && argument.expressions.length === 0) {
    return argument.quasis[0].value.cooked ?? null;
  }
  return null;
}

function serializeScriptString(value: string, original: string): string {
  const escaped = JSON.stringify(value).slice(1, -1).replaceAll('<', '\\u003c');
  return original.startsWith("'") ? `'${escaped.replaceAll("'", "\\'")}'` : `"${escaped}"`;
}

function rewriteScriptIdReferences(scriptHtml: string, idRenames: ReadonlyMap<string, string>) {
  if (idRenames.size === 0) return scriptHtml;
  let program: ReturnType<typeof parse>;
  try {
    program = parse(scriptHtml, { ecmaVersion: 'latest', sourceType: 'script' });
  } catch {
    try {
      program = parse(scriptHtml, { ecmaVersion: 'latest', sourceType: 'module' });
    } catch {
      return scriptHtml;
    }
  }

  const replacements: { start: number; end: number; value: string }[] = [];
  simple(program, {
    CallExpression(call) {
      const argument = call.arguments[0];
      if (call.arguments.length !== 1 || argument.type === 'SpreadElement') return;
      const callee = call.callee;
      const name =
        callee.type === 'Identifier'
          ? callee.name
          : callee.type === 'MemberExpression' &&
              !callee.computed &&
              callee.property.type === 'Identifier'
            ? callee.property.name
            : null;
      if (!name) return;

      const value = literalString(argument);
      if (value === null) return;
      const renamed =
        name === 'getElementById'
          ? (idRenames.get(value) ?? value)
          : ['querySelector', 'querySelectorAll', 'closest', 'matches', '$'].includes(name)
            ? rewriteCssIdReferences(value, 'selectorList', idRenames)
            : value;
      if (renamed === value) return;
      replacements.push({
        start: argument.start,
        end: argument.end,
        value: serializeScriptString(renamed, scriptHtml.slice(argument.start, argument.end)),
      });
    },
  });

  return replacements
    .sort((first, second) => second.start - first.start)
    .reduce(
      (script, { start, end, value }) => script.slice(0, start) + value + script.slice(end),
      scriptHtml,
    );
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

function namespaceGraphSvgs($: cheerio.CheerioAPI, namespace: string): void {
  const reservedIds = new Set(getIds($));
  $('.pl-graph > svg').each((index, element) => {
    const svg = cheerio.load($.html(element), undefined, false);
    const idRenames = new Map(
      [...new Set(getIds(svg))].map((id) => [
        id,
        reserveUniqueId(`${namespace}-graph-${index + 1}-${id}`, reservedIds),
      ]),
    );
    renameIdsAndReferences(svg, idRenames);
    $(element).replaceWith(svg.root().html() ?? '');
  });
}

/** Namespaces IDs that occur in more than one independently rendered question fragment. */
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
    namespaceGraphSvgs($, namespace);
    assertNoDuplicateIds($, namespace);
    return { $, namespace };
  });

  const reservedIds = new Set(fragments.flatMap(({ $ }) => getIds($)));
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
