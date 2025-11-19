# `@prairielearn/markdown`

Utilities for rendering and sanitizing Markdown content, with support for math rendering and HTML sanitization.

## Usage

```ts
import { markdownToHtml } from '@prairielearn/markdown';

// Basic usage with defaults (sanitization, math, and HTML enabled)
const html = markdownToHtml('# Hello **world**!');

// Inline markdown (no wrapping <p> tags)
const inlineHtml = markdownToHtml('Some **bold** text', { inline: true });

// Without sanitization
const unsafeHtml = markdownToHtml(markdown, { sanitize: false });

// Without math processing
const noMath = markdownToHtml(markdown, { interpretMath: false });

// Strip HTML tags
const noHtml = markdownToHtml('Some text <em>with HTML</em>', { allowHtml: false });
```

### Options

- `sanitize` (default: `true`): If true, sanitizes the HTML output using DOMPurify to prevent XSS attacks.
- `inline` (default: `false`): If true, parses the markdown as inline content (without wrapping block elements).
- `allowHtml` (default: `true`): If true, allows HTML tags in the markdown. If false, HTML tags will be removed from the output.
- `interpretMath` (default: `true`): If true, prepares and escapes LaTeX strings to be parsed by MathJax (assumes MathJax is available client-side).

### Advanced usage with custom extensions

For advanced use cases requiring custom Marked extensions, you can create your own instance:

```ts
import { createMarkedInstance } from '@prairielearn/markdown';

const marked = createMarkedInstance({
  sanitize: true,
  allowHtml: true,
  interpretMath: true,
  extensions: [myCustomExtension],
});

const html = marked.parse('# Custom markdown');
```

Note that `createMarkedInstance` does not use caching, so callers that rely on extensions should perform their own caching if needed.

## Performance considerations

⚠️ **Important**: When sanitization is enabled (the default), this package uses `jsdom` and `dompurify` to sanitize HTML output. These libraries create DOM-like structures that need to be cleaned up properly.

**This package is not suitable for use in long, synchronous tasks that don't yield to the event loop**, as they prevent `jsdom` from cleaning up its resources and can ultimately lead to out-of-memory errors.

If you need to process large amounts of markdown in a tight loop, consider:

- Disabling sanitization with `{ sanitize: false }` if the content is trusted
- Using `setImmediate()` or `await Promise.resolve()` periodically to yield to the event loop
- Processing markdown in smaller batches with breaks between them

This limitation only applies when sanitization is enabled. If you disable sanitization, there are no special memory management concerns.
