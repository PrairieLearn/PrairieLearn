import { type ComponentType, type Attributes, type VNode } from 'preact';
import { h } from 'preact';
import { render } from 'preact-render-to-string';

// Based on https://pkg.go.dev/encoding/json#HTMLEscape
const ENCODE_HTML_RULES: Record<string, string> = {
  '&': '\\u0026',
  '>': '\\u003e',
  '<': '\\u003c',
  '\u2028': '\\u2028',
  '\u2029': '\\u2029',
};
const MATCH_HTML = /[&><\u2028\u2029]/g;

function escapeJsonForHtml(value: any): string {
  return JSON.stringify(value).replace(MATCH_HTML, (c) => ENCODE_HTML_RULES[c] || c);
}

export function renderHtmlDocument(content: VNode) {
  return `<!doctype html>\n${render(content)}`;
}

export function renderForClientHydration<T>(
  id: string,
  Component: ComponentType<T>,
  props: T & Attributes,
): VNode {
  return (
    <div id={id} class="js-react-fragment">
      <script
        type="application/json"
        id={`${id}-props`}
        dangerouslySetInnerHTML={{
          __html: escapeJsonForHtml(props),
        }}
      />
      <div id={`${id}-root`}>
        <Component {...props} />
      </div>
    </div>
  );
}
