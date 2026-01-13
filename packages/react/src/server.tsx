import clsx from 'clsx';
import { Fragment, type ReactElement, type ReactNode, isValidElement } from 'react';
import superjson from 'superjson';

import { compiledScriptPath, compiledScriptPreloadPaths } from '@prairielearn/compiled-assets';
import { AugmentedError } from '@prairielearn/error';
import { type HtmlSafeString, html } from '@prairielearn/html';

import { renderHtml } from './index.js';

// Based on https://pkg.go.dev/encoding/json#HTMLEscape
const ENCODE_HTML_RULES: Record<string, string> = {
  '&': '\\u0026',
  '>': '\\u003e',
  '<': '\\u003c',
  '\u2028': '\\u2028',
  '\u2029': '\\u2029',
};
const MATCH_HTML = /[&><\u2028\u2029]/g;

/**
 * Escape a value for use in a JSON string that will be rendered in HTML.
 *
 * @param value - The value to escape.
 * @returns A JSON string with HTML-sensitive characters escaped.
 */
function escapeJsonForHtml(value: any): string {
  return superjson.stringify(value).replaceAll(MATCH_HTML, (c) => ENCODE_HTML_RULES[c] || c);
}

/**
 * Render an entire React page as an HTML document.
 *
 * @param content - A React node to render to HTML.
 * @returns An HTML string containing the rendered content.
 */
export function renderHtmlDocument(content: ReactNode): string {
  return `<!doctype html>\n${renderHtml(content)}`;
}

interface HydrateProps<T> {
  /** The component to hydrate. */
  children: ReactElement<T>;
  /** Optional override for the component's name or displayName. */
  nameOverride?: string;
  /** Whether to apply full height styles. */
  fullHeight?: boolean;
  /** Optional CSS class to apply to the container. */
  className?: string;
}

/**
 * A component that renders a React component for client-side hydration.
 * All interactive components will need to be hydrated.
 * This component is intended to be used within a non-interactive React component
 * that will be rendered without hydration through `renderHtml`.
 */
export function Hydrate<T>({
  children,
  nameOverride,
  className,
  fullHeight = false,
}: HydrateProps<T>): ReactNode {
  if (!isValidElement(children)) {
    throw new Error('<Hydrate> expects a single React component as its child');
  }

  if (children.type === Fragment) {
    throw new Error('<Hydrate> does not support fragments');
  }

  const { type: Component, props } = children;
  if (typeof Component !== 'function') {
    throw new Error('<Hydrate> expects a React component');
  }

  // Note that we don't use `Component.name` here because it can be minified or mangled.
  const componentName = nameOverride ?? (Component as any).displayName;
  if (!componentName) {
    // This is only defined in development, not in production when the function name is minified.
    const componentDevName = Component.name || 'UnknownComponent';
    throw new AugmentedError(
      '<Hydrate> expects a component to have a displayName or nameOverride.',
      {
        info: html`
          <div>
            <p>Make sure to add a displayName to the component:</p>
            <pre><code>export const ${componentDevName} = ...;
// Add this line:
${componentDevName}.displayName = '${componentDevName}';</code></pre>
          </div>
        `,
      },
    );
  }

  const scriptPath = `esm-bundles/hydrated-components/${componentName}.ts`;
  let compiledScriptSrc = '';
  try {
    compiledScriptSrc = compiledScriptPath(scriptPath);
  } catch (error) {
    throw new AugmentedError(`Could not find script for component "${componentName}".`, {
      info: html`
        <div>
          Make sure you create a script at
          <code>esm-bundles/hydrated-components/${componentName}.ts</code> registering the
          component:
          <pre><code>import { registerHydratedComponent } from '@prairielearn/react/hydrated-component';

import { ${componentName} } from './path/to/component.js';

registerHydratedComponent(${componentName});</code></pre>
        </div>
      `,
      cause: error,
    });
  }
  const scriptPreloads = compiledScriptPreloadPaths(scriptPath);
  return (
    <Fragment>
      <script type="module" src={compiledScriptSrc} />
      {scriptPreloads.map((preloadPath) => (
        <link key={preloadPath} rel="modulepreload" href={preloadPath} />
      ))}
      <script
        type="application/json"
        // eslint-disable-next-line @eslint-react/dom/no-dangerously-set-innerhtml
        dangerouslySetInnerHTML={{
          __html: escapeJsonForHtml(props),
        }}
        data-component={componentName}
        data-component-props
      />
      <div
        data-component={componentName}
        className={clsx('js-hydrated-component', { 'h-100': fullHeight }, className)}
      >
        <Component {...props} />
      </div>
    </Fragment>
  );
}

/**
 * Renders a React component for client-side hydration and returns an HTML-safe string.
 * This function is intended to be used within a tagged template literal, e.g. html`...`.
 *
 * @param content - A React node to render to HTML.
 * @returns An `HtmlSafeString` containing the rendered HTML.
 */
export function hydrateHtml<T>(
  content: ReactElement<T>,
  props: Omit<HydrateProps<T>, 'children'> = {},
): HtmlSafeString {
  // Useful for adding React components to existing tagged-template pages.
  return renderHtml(<Hydrate {...props}>{content}</Hydrate>);
}
