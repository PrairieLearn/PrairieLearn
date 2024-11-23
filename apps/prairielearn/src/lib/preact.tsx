import { type ComponentType, type Attributes } from 'preact';
import { h } from 'preact';
import { render } from 'preact-render-to-string';

import { type HtmlSafeString, unsafeHtml } from '@prairielearn/html';

const ENCODE_HTML_RULES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  // TODO: needed?
  // '"': '&#34;',
  // "'": '&#39;',
};
const MATCH_HTML = /[&<>'"]/g;

function encodeCharacter(c: string) {
  return ENCODE_HTML_RULES[c] || c;
}

/**
 * Based on the `escapeXML` function from the `ejs` library.
 */
function escapeHtmlRaw(value: string): string {
  return value == null ? '' : String(value).replace(MATCH_HTML, encodeCharacter);
}

export function renderWithProps<T>(
  id: string,
  Component: ComponentType<T>,
  props: T & Attributes,
): HtmlSafeString {
  return unsafeHtml(
    render(
      <div id={id} class="js-react-fragment">
        <script
          type="application/json"
          id={`${id}-props`}
          dangerouslySetInnerHTML={{
            __html: escapeHtmlRaw(JSON.stringify(props)),
          }}
        ></script>
        <div id={`${id}-root`}>
          <Component {...props} />
        </div>
      </div>,
    ),
  );
}
