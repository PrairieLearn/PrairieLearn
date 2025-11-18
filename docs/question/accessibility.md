# Authoring accessible questions

Ensuring that PrairieLearn questions are accessible to all students, including those with disabilities, is crucial for an inclusive learning environment. This guide provides recommendations for authors to create accessible question content.

## Semantic HTML

Using semantic HTML elements appropriately is the foundation of web accessibility. Semantic HTML means using HTML tags for their intended purpose, which helps assistive technologies (like screen readers) understand the structure and meaning of the content.

- **Headings**: Use `<h1>`, `<h2>`, etc., to structure your question content logically. Avoid skipping heading levels.
- **Lists**: Use `<ol>` for ordered lists and `<ul>` for unordered lists. Use `<li>` for list items.
- **Paragraphs**: Wrap text content in `<p>` tags.
- **Emphasis**: Use `<em>` for emphasis and `<strong>` for strong importance, rather than relying on visual styling alone.
- **Tables**: Use `<table>` with `<thead>`, `<tbody>`, `<tr>`, `<th>`, and `<td>` appropriately. Ensure tables have clear headings and meaningful row/column relationships. [MDN's table accessibility guide](https://developer.mozilla.org/en-US/docs/Learn_web_development/Core/Structuring_content/Table_accessibility) provides a good overview of how to create accessible tables.

## Text alternatives for non-text content

All non-text content must have a text alternative that serves an equivalent purpose.

### Images and figures (`pl-figure`)

When using the [`pl-figure`](../elements/pl-figure.md) element to embed images, always provide descriptive alternative text (alt text) via the `alt` attribute. Good alt text is concise and conveys the essential information or function of the image.

```html
<pl-figure
  file-name="diagram.png"
  alt="A free-body diagram showing forces acting on a block on an inclined plane."
></pl-figure>
```

If the figure contains complex information that's essential to understand the content or answer the question, you should provide that information elsewhere in the question text.

### Input elements

Many PrairieLearn elements that involve student input have attributes to enhance accessibility. For example, most input elements support a `label` attribute that is shown visually next to the input:

```html
<pl-integer-input answers-name="num_apples" label="Number of apples:"></pl-integer-input>
```

Many elements support an `aria-label` attribute to provide a label that is not visible on the page but can be read by assistive technologies. This can be used in addition to or instead of the `label` attribute, as appropriate. This is particularly useful for elements like `<pl-multiple-choice>` where the default accessible label may not be sufficient.

```html
<pl-multiple-choice answers-name="x" aria-label="Value of x in the equation">
  <pl-answer correct="false">1</pl-answer>
  <pl-answer correct="true">2</pl-answer>
  <pl-answer correct="false">3</pl-answer>
  <pl-answer correct="false">4</pl-answer>
</pl-multiple-choice>
```

Consult [the documentation for each specific PrairieLearn element](../elements.md) to understand its accessibility features and best practices.

## Perceivable content

- **Color contrast**: Ensure sufficient contrast between text and background colors. Do not rely on color alone to convey information.
- **Text resizing**: Content should remain readable and functional when text is resized.
- **External resources**: If linking to or embedding resources like PDFs or videos, ensure they also follow accessibility best practices. For example, PDFs should have selectable text and a logical reading order, and videos should have accurate captions or subtitles.

## Operable content

- **Keyboard navigation**: All interactive elements in a question should be operable via a keyboard.
- **Focus indicators**: Ensure that keyboard focus is visible and clear.

Most PrairieLearn elements are designed to meet these requirements by default. However, any custom HTML or JavaScript should be tested to ensure that it is also operable via keyboard navigation.

!!! note "Alternative question formats"

    Some elements that are inherently used for visual input, e.g. `<pl-drawing>` and `<pl-excalidraw>`, are currently not usable via keyboard navigation and screen readers. If you use these elements, consider providing an alternative question format for students who cannot use them, e.g. a freeform text input where they can describe the drawing or diagram.

## Understandable content

- **Clear language**: Use clear and concise language. Avoid jargon where possible, or provide explanations.
- **Consistent navigation**: Maintain a consistent layout and structure for your questions.
- **Cultural relevance**: Use examples and values that are understandable and relevant to a diverse audience.

## Testing for accessibility

While PrairieLearn aims to provide accessible building blocks, it's important to test your questions for accessibility.

- **Keyboard-only navigation**: Can you navigate and answer the question using only the keyboard?
- **Screen reader**: Use a screen reader (e.g., [NVDA](https://www.nvaccess.org/download/) or [JAWS](https://www.freedomscientific.com/products/software/jaws/) for Windows, [Orca](https://help.gnome.org/users/orca/stable/index.html.en) for Linux, or [VoiceOver](https://www.apple.com/accessibility/voiceover/) for macOS) to experience the question like a student who is blind or has low vision.
- **Accessibility checkers**: Browser extensions and online tools can help identify common accessibility issues. However, they cannot identify all issues, so manual testing is still important.
