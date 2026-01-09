# `@prairielearn/preact`

Utilities for rendering Preact components within PrairieLearn's HTML templating system, including static rendering and client-side hydration.

## Usage

### Rendering static HTML

To render a non-interactive Preact component to an HTML-safe string, use `renderHtml`:

```tsx
import { renderHtml } from '@prairielearn/preact/server';
import { html } from '@prairielearn/html';

function MyComponent() {
  return <div>Hello, world!</div>;
}

const template = html`<div class="container">${renderHtml(<MyComponent />)}</div>`;
```

To render a complete document with a DOCTYPE declaration, use `renderHtmlDocument`:

```tsx
import { renderHtmlDocument } from '@prairielearn/preact/server';

const htmlDoc = renderHtmlDocument(
  <html>
    <head>
      <title>My Page</title>
    </head>
    <body>Content</body>
  </html>,
);
```

### Rendering components for client-side hydration

Interactive components that require client-side JavaScript must be wrapped in a `<Hydrate>` component. This sets up the necessary HTML structure and data attributes for hydration.

The root component must live in a module that can be imported on the client, and it must have a `displayName` property set. This is used to identify the component during hydration.

```tsx
import { Hydrate } from '@prairielearn/preact/server';

function InteractiveComponent({ name }: { name: string }) {
  return <button onClick={() => alert(`Hello, ${name}!`)}>Click me</button>;
}

InteractiveComponent.displayName = 'InteractiveComponent';
```

When rendering the page, wrap the component in `<Hydrate>`:

```tsx
<Hydrate>
  <InteractiveComponent name="Alice" />
</Hydrate>
```

Alternatively, you can use the `hydrateHtml` convenience function to produce an HTML-safe string directly:

```tsx
import { hydrateHtml } from '@prairielearn/preact/server';
import { html } from '@prairielearn/html';

const template = html`
  <div class="container">${hydrateHtml(<InteractiveComponent name="Alice" />)}</div>
`;
```

This will render the component to HTML, serialize the component's props using `superjson`, and produce markup that the client can use to hydrate the component.

**Important**: all serialized props will be visible on the client, so avoid passing sensitive data. The main PrairieLearn application includes Zod schemas to strip down data structures before passing them to hydrated components (e.g. `apps/prairielearn/src/lib/client/safe-db-types.ts` and `apps/prairielearn/src/lib/client/page-context.ts`).

Hydration relies on `@prairielearn/compiled-assets` to produce the necessary client-side bundles, and there are conventions that must be followed. Specifically, you must create a file in `assets/scripts/esm-bundles/hydrated-components`, and the file's name must match the `displayName` of the component to be hydrated. For the above example, the file would be `assets/scripts/esm-bundles/hydrated-components/InteractiveComponent.ts`. It must contain a call to `registerHydratedComponent` with the component that will be hydrated:

```ts
import { registerHydratedComponent } from '@prairielearn/preact/hydrated-component';

import { InteractiveComponent } from '../../../../src/components/InteractiveComponent.js';

registerHydratedComponent(InteractiveComponent);
```
