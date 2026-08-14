import assert from 'node:assert';

import createDOMPurify, { type Config, type UponSanitizeAttributeHookEvent } from 'dompurify';
import { JSDOM } from 'jsdom';

const INSTANCE_MAX_USES = 1000;
const SVG_NAMESPACE = 'http://www.w3.org/2000/svg';

const SVG_CONFIG = {
  ADD_TAGS: ['use'],
  FORBID_TAGS: ['animate', 'animateMotion', 'animateTransform', 'set', 'style'],
  NAMESPACE: SVG_NAMESPACE,
  PARSER_MEDIA_TYPE: 'image/svg+xml',
  USE_PROFILES: { svg: true, svgFilters: true },
} satisfies Config;

const REFERENCE_ATTRIBUTES = new Set(['href', 'src', 'xlink:href']);
// DOMPurify sanitizes SVG markup but not CSS declarations. Keep common presentation properties
// while separately restricting every CSS URL to a same-document fragment.
const ALLOWED_STYLE_PROPERTIES = new Set([
  'alignment-baseline',
  'baseline-shift',
  'clip-path',
  'color',
  'color-interpolation',
  'color-interpolation-filters',
  'color-rendering',
  'direction',
  'display',
  'dominant-baseline',
  'fill',
  'fill-opacity',
  'fill-rule',
  'filter',
  'flood-color',
  'flood-opacity',
  'font-family',
  'font-size',
  'font-stretch',
  'font-style',
  'font-variant',
  'font-weight',
  'image-rendering',
  'letter-spacing',
  'lighting-color',
  'marker-end',
  'marker-mid',
  'marker-start',
  'mask',
  'opacity',
  'overflow',
  'paint-order',
  'pointer-events',
  'shape-rendering',
  'stop-color',
  'stop-opacity',
  'stroke',
  'stroke-dasharray',
  'stroke-dashoffset',
  'stroke-linecap',
  'stroke-linejoin',
  'stroke-miterlimit',
  'stroke-opacity',
  'stroke-width',
  'text-anchor',
  'text-decoration',
  'text-rendering',
  'transform',
  'transform-origin',
  'unicode-bidi',
  'vector-effect',
  'vertical-align',
  'visibility',
  'white-space',
  'word-spacing',
  'writing-mode',
]);

interface SanitizeInstance {
  jsdom: JSDOM;
  dompurify: ReturnType<typeof createDOMPurify>;
  uses: number;
}

let instance: SanitizeInstance | null = null;

function getOrCreateInstance(): SanitizeInstance {
  if (instance && instance.uses < INSTANCE_MAX_USES) {
    instance.uses += 1;
    return instance;
  }

  // JSDOM windows retain memory over time, so periodically replace the window rather than
  // keeping one instance alive for the lifetime of the server.
  instance?.jsdom.window.close();

  const jsdom = new JSDOM('');
  const dompurify = createDOMPurify(jsdom.window);
  assert(dompurify.isSupported);
  dompurify.addHook('uponSanitizeAttribute', sanitizeAttribute);

  instance = { jsdom, dompurify, uses: 1 };
  return instance;
}

function sanitizeAttribute(element: Element, attribute: UponSanitizeAttributeHookEvent): void {
  const attributeName = attribute.attrName.toLowerCase();

  if (attributeName === 'xml:base') {
    attribute.keepAttr = false;
    return;
  }

  if (REFERENCE_ATTRIBUTES.has(attributeName)) {
    const elementName = element.localName.toLowerCase();
    if (!isSafeReference(attribute.attrValue, elementName)) attribute.keepAttr = false;
    return;
  }

  if (attributeName === 'style') {
    const style = sanitizeStyle(element as SVGElement);
    if (style) {
      attribute.attrValue = style;
    } else {
      attribute.keepAttr = false;
    }
    return;
  }

  if (!hasOnlySafeCssUrls(attribute.attrValue)) {
    attribute.keepAttr = false;
  }
}

function isSafeReference(value: string, elementName: string): boolean {
  const trimmedValue = value.trim();
  if (/^#[A-Za-z_][\w:.-]*$/.test(trimmedValue)) return true;

  return (
    (elementName === 'image' || elementName === 'feimage') &&
    /^data:image\/(?:avif|gif|jpeg|png|webp);base64,[A-Za-z0-9+/=\s]+$/.test(trimmedValue)
  );
}

function sanitizeStyle(element: SVGElement): string {
  const declarations: string[] = [];
  for (let index = 0; index < element.style.length; index += 1) {
    const property = element.style.item(index).toLowerCase();
    const value = element.style.getPropertyValue(property).trim();
    if (ALLOWED_STYLE_PROPERTIES.has(property) && hasOnlySafeCssUrls(value)) {
      declarations.push(`${property}: ${value}`);
    }
  }
  return declarations.join('; ');
}

function hasOnlySafeCssUrls(value: string): boolean {
  if (/[\\{}<>@]|\/\*/.test(value)) return false;

  const withoutSafeUrls = value.replaceAll(/url\(\s*(["']?)#[A-Za-z_][\w:.-]*\1\s*\)/gi, '');
  return !/url\s*\(/i.test(withoutSafeUrls);
}

/**
 * Sanitizes an untrusted SVG before it is served as a same-origin question asset. Active content
 * is removed, and resource references are limited to local fragments or embedded raster images.
 */
export function sanitizeQtiImportSvg(content: Buffer): Buffer {
  const source = new TextDecoder('utf-8', { fatal: true }).decode(content);
  if (/<!\s*(?:doctype|entity)\b/i.test(source)) {
    throw new Error('Remote SVG contains a document type or entity declaration');
  }

  const { jsdom, dompurify } = getOrCreateInstance();
  const sanitized = dompurify.sanitize(source, SVG_CONFIG);
  const document = new jsdom.window.DOMParser().parseFromString(sanitized, 'image/svg+xml');
  const root = document.documentElement;
  if (root.localName !== 'svg' || root.namespaceURI !== SVG_NAMESPACE) {
    throw new Error('Remote image is not a valid SVG');
  }
  if (document.querySelector('parsererror')) {
    throw new Error('Remote image is not a valid SVG');
  }

  return Buffer.from(new jsdom.window.XMLSerializer().serializeToString(root));
}
