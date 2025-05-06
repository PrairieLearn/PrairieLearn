# Authoring accessible questions

Ensuring that PrairieLearn questions are accessible to all students, including those with disabilities, is crucial for an inclusive learning environment. This guide provides recommendations for authors to create accessible question content.

## Semantic HTML

Using semantic HTML elements appropriately is the foundation of web accessibility. Semantic HTML means using HTML tags for their intended purpose, which helps assistive technologies (like screen readers) understand the structure and meaning of the content.

- **Headings**: Use `<h1>`, `<h2>`, etc., to structure your question content logically. Avoid skipping heading levels.
- **Lists**: Use `<ol>` for ordered lists and `<ul>` for unordered lists, and `<li>` for list items.
- **Paragraphs**: Wrap text content in `<p>` tags.
- **Emphasis**: Use `<em>` for emphasis and `<strong>` for strong importance, rather than relying on visual styling alone.

## Text alternatives for non-text content

All non-text content must have a text alternative that serves an equivalent purpose.

### Images and figures (`pl-figure`)

When using the [`pl-figure`](../elements.md#pl-figure-element) element to embed images, always provide descriptive alternative text (alt text) via the `alt` attribute. Good alt text is concise and conveys the essential information or function of the image.

```html
<pl-figure
  file-name="diagram.png"
  alt="A free-body diagram showing forces acting on a block on an inclined plane."
></pl-figure>
```

If the figure contains complex information that's essential for understanding the content, you should provide that information elsewhere in the question text.

### Input elements

Many PrairieLearn elements that involve student input have attributes to enhance accessibility. For example, most input elements support a `label` attribute that is shown visually next to the input:

```html
<pl-integer-input answers-name="num_apples" label="Number of apples:"></pl-integer-input>
```

Sometimes, the visual label may not be sufficient for screen readers. In such cases, you can use the `aria-label` attribute to provide a more descriptive label that is not visible on the page but can be read by assistive technologies. For instance, in the following example, the visual label is "x =", but the screen reader will read "Enter the value of x in the equation 2x + 3 = 7":

```html
<p>What is the value of <em>x</em> in the equation <em>2x + 3 = 7</em>?</p>

<pl-integer-input
  answers-name="x"
  label="$x =$"
  aria-label="Enter the value of x in the equation 2x + 3 = 7"
></pl-integer-input>
```

Consult [the documentation for each specific PrairieLearn element](../elements.md) to understand its accessibility features and best practices.

## Perceivable content

- **Color contrast**: Ensure sufficient contrast between text and background colors. Avoid relying on color alone to convey information.
- **Text resizing**: Content should remain readable and functional when text is resized.

## Operable content

- **Keyboard navigation**: All interactive elements in a question should be operable via a keyboard.
- **Focus indicators**: Ensure that keyboard focus is visible and clear.

Most PrairieLearn elements are designed to meet these requirements by default. However, any custom HTML or JavaScript should be tested to ensure that it is also operable via keyboard navigation.

!!! note "Alternative question formats"

    Some elements that are inherently used for visual input, e.g. `<pl-drawing>` and `<pl-excalidraw>`, are currently not usable via keyboard navigation and screen readers. If you use these elements, consider providing an alternative question format for students who cannot use them, e.g. a freeform text input where they can describe the drawing or diagram.

## Understandable content

- **Clear language**: Use clear and concise language. Avoid jargon where possible, or provide explanations.
- **Consistent navigation**: Maintain a consistent layout and structure for your questions.

## Testing for accessibility

While PrairieLearn aims to provide accessible building blocks, it's important to test your questions for accessibility.

- **Keyboard-only navigation**: Can you navigate and answer the question using only the keyboard?
- **Screen reader**: Use a screen reader (e.g. NVDA, JAWS, or VoiceOver) to experience the question like a student who is blind or has low vision.
- **Accessibility checkers**: Browser extensions and online tools can help identify common accessibility issues.
