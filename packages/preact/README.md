# @prairielearn/preact

Utilities for rendering Preact components within PrairieLearn's HTML templating system.

## Overview

This package provides utilities to integrate Preact components with PrairieLearn's legacy tagged template literal HTML system. It includes functions for both static rendering and client-side hydration.

## Functions

### `renderHtml(vnode: VNode | string): HtmlSafeString`

Renders a non-interactive Preact component to an HTML-safe string for use within tagged template literals.

```tsx
import { renderHtml } from '@prairielearn/preact';
import { html } from '@prairielearn/html';

function MyComponent() {
  return <div>Hello, world!</div>;
}

const template = html` <div class="container">${renderHtml(<MyComponent />)}</div> `;
```

### `Hydrate`

A component that sets up client-side hydration for interactive Preact components. All interactive components need to be wrapped with `Hydrate`.

```tsx
import { Hydrate } from '@prairielearn/preact';

function InteractiveComponent() {
  // ... component with hooks and interactivity
}

// The component must have a displayName for hydration
InteractiveComponent.displayName = 'InteractiveComponent';

// Usage
<Hydrate>
  <InteractiveComponent prop1="value" />
</Hydrate>;
```

This should be accompanied by a registration script at `esm-bundles/react-fragments/InteractiveComponent.ts`:

```ts
import { InteractiveComponent } from '../../../../src/components/InteractiveComponent.js';
import { registerReactFragment } from '../../behaviors/react-fragments/index.js';

registerReactFragment(InteractiveComponent);
```

- All hydrated values need to be serializable with `superjson`.
- Only the root component needs to be registered and have a `displayName`.
- All values passed to a hydrated component are viewable on the client. Ensure that no sensitive data is passed to a hydrated component, e.g. by using stripped down data structures (like those found in `apps/prairielearn/src/lib/client/safe-db-types.ts` and `apps/prairielearn/src/lib/client/page-context.ts`).

### `hydrateHtml(content: VNode): HtmlSafeString`

Convenience function that combines `Hydrate` and `renderHtml` for adding interactive Preact components to tagged template pages.

```tsx
import { hydrateHtml } from '@prairielearn/preact';
import { html } from '@prairielearn/html';

const template = html`
  <div class="container">${hydrateHtml(<InteractiveComponent prop1="value" />)}</div>
`;
```

### `renderHtmlDocument(content: VNode): string`

Renders a complete HTML document with DOCTYPE declaration.

```tsx
import { renderHtmlDocument } from '@prairielearn/preact';

const htmlDoc = renderHtmlDocument(
  <html>
    <head>
      <title>My Page</title>
    </head>
    <body>Content</body>
  </html>,
);
```

## Client-Side Hydration Setup

For interactive components, you must:

1. Add a `displayName` to your component
2. Create a registration script at `esm-bundles/react-fragments/ComponentName.ts`:

```ts
import { MyComponent } from '../../../../src/components/MyComponent.js';
import { registerReactFragment } from '../../behaviors/react-fragments/index.js';

registerReactFragment(MyComponent);
```

## Dependencies

- `@prairielearn/preact-cjs` - Preact runtime
- `@prairielearn/html` - HTML utilities
- `@prairielearn/compiled-assets` - Asset compilation
- `@prairielearn/error` - Error handling
- `preact-render-to-string` - Server-side rendering
- `clsx` - CSS class utilities
- `superjson` - JSON serialization
