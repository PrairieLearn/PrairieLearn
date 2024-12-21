# PrairieLearn Elements for use in `question.html`

When writing questions, there exists a core pool of elements that provides
common structures associated with assessment items. These elements can be
split into three distinct groups: **submission**, **decorative**, and
**conditional**. Within this document, all of PrairieLearn's elements are
displayed alongside links to sample elements within the example course. To
build your own PrairieLearn element, please see [Question Element Writing](devElements.md)
documentation.

### Submission elements

**Submission** elements act as a way to receive a response or input from the
student. These elements are traditionally referred to as form input fields.
PrairieLearn presently provides the following templated **input field** elements:

- [`pl-big-o-input`](elements/submission-elements.md#pl-big-o-input-element): Fill in a **symbolic** value
  representing asymptotic input.
- [`pl-checkbox`](elements/submission-elements.md#pl-checkbox-element): Selecting **multiple options** from a
  list.
- [`pl-excalidraw`](elements/submission-elements.md#pl-excalidraw-element): Draw a **vector diagram** using
  [excalidraw](https://github.com/excalidraw/excalidraw).
- [`pl-file-editor`](elements/submission-elements.md#pl-file-editor-element): Provide an in-browser code editor
  for writing and submitting code.
- [`pl-file-upload`](elements/submission-elements.md#pl-file-upload-element): Provide a submission area
  to obtain a file with a specific naming scheme.
- [`pl-integer-input`](elements/submission-elements.md#pl-integer-input-element): Fill in an **integer** value
  such as -71, 0, 5, 21, and so on.
- [`pl-matching`](elements/submission-elements.md#pl-matching-element): Select a matching option for each entry in
  a group.
- [`pl-matrix-component-input`](elements/submission-elements.md#pl-matrix-component-input-element): Fill in
  a **matrix** using grid that has an input area for each element.
- [`pl-matrix-input`](elements/submission-elements.md#pl-matrix-input-element): Supply a matrix in a supported
  programming language format.
- [`pl-multiple-choice`](elements/submission-elements.md#pl-multiple-choice-element): Selecting only
  **one option** from a list.
- [`pl-number-input`](elements/submission-elements.md#pl-number-input-element): Fill in a **numerical** value
  within a specific tolerance level such as 3.14, -1.921, and so on.
- [`pl-order-blocks`](elements/submission-elements.md#pl-order-blocks-element): Select and arrange given blocks of code or text.
- [`pl-rich-text-editor`](elements/submission-elements.md#pl-rich-text-editor-element): Provide an in-browser formattable text editor
  for writing and submitting code.
- [`pl-string-input`](elements/submission-elements.md#pl-string-input-element): Fill in a **string** value
  such as "Illinois", "GATTACA", "computer", and so on.
- [`pl-symbolic-input`](elements/submission-elements.md#pl-symbolic-input-element): Fill in a **symbolic** value
  such as `x^2`, `sin(z)`, `mc^2`, and so on.
- [`pl-units-input`](elements/submission-elements.md#pl-units-input-element): Fill in a **number** and a **unit**
  such as "1.5 m", "14 ms", "6.3 ft", and so on.

### Decorative elements

**Decorative** elements are meant to improve how the question is displayed to
students. Elements under this category include ways to specify question markup,
images, files, and code display. The following **decorative** elements are available:

- [`pl-card`](elements/decorative-elements.md#pl-card-element): Displays content within a card-styled component.
- [`pl-code`](elements/decorative-elements.md#pl-code-element): Displays code rendered with the appropriate
  syntax highlighting.
- [`pl-dataframe`](elements/decorative-elements.md#pl-dataframe-element): Display DataFrames with various options.
- [`pl-drawing`](elements/decorative-elements.md#pl-drawing-element): Creates an image from pre-defined
  collection of graphic objects
- [`pl-external-grader-variables`](elements/decorative-elements.md#pl-external-grader-variables-element): Displays expected and given variables for externally graded questions.
- [`pl-figure`](elements/decorative-elements.md#pl-figure-element): Embed an image file in the question.
- [`pl-file-download`](elements/decorative-elements.md#pl-file-download-element): Enable file downloads for
  data-centric questions.
- [`pl-file-preview`](elements/decorative-elements.md#pl-file-preview-element): Displays a preview of submitted files.
- [`pl-graph`](elements/decorative-elements.md#pl-graph-element): Displays graphs, using [GraphViz DOT notation](https://graphviz.org/doc/info/lang.html), an adjacency matrix, or a [`networkx`](https://networkx.org/) graph.
- [`pl-matrix-latex`](elements/decorative-elements.md#pl-matrix-latex-element): Displays matrices using
  appropriate LaTeX commands for use in a mathematical expression.
- [`pl-overlay`](elements/decorative-elements.md#pl-overlay-element): Allows layering existing elements on top of one another in specified positions.
- [`pl-python-variable`](elements/decorative-elements.md#pl-python-variable-element): Display formatted output of Python variables.
- [`pl-variable-output`](elements/decorative-elements.md#pl-variable-output-element): Displays matrices in
  code form for supported programming languages.
- [`pl-template`](elements/decorative-elements.md#pl-template-element): Displays content from mustache templates.
- [`pl-xss-safe`](elements/decorative-elements.md#pl-xss-safe-element): Removes potentially unsafe code from HTML code.

### Conditional elements

**Conditional** elements are meant to improve the feedback and question structure.
These elements conditionally render their content depending on the question state.
The following **Conditional** elements are available:

- [`pl-answer-panel`](elements/conditional-elements.md#pl-answer-panel-element): Displays the correct
  answer to a given question.
- [`pl-external-grader-results`](elements/conditional-elements.md#pl-external-grader-results-element):
  Displays results from questions that are externally graded.
- [`pl-hide-in-panel`](elements/conditional-elements.md#pl-hide-in-panel-element): Hides content in one or more display panels.
- [`pl-hide-in-manual-grading`](elements/conditional-elements.md#pl-hide-in-manual-grading-element): Hides content in the manual grading page.
- [`pl-hidden-hints`](elements/conditional-elements.md#pl-hidden-hints-element): Displays hints as a student submits more on the current variant.
- [`pl-manual-grading-only`](elements/conditional-elements.md#pl-manual-grading-only-element): Shows content only in manual grading.
- [`pl-question-panel`](elements/conditional-elements.md#pl-question-panel-element): Displays the text of a
  question.
- [`pl-submission-panel`](elements/conditional-elements.md#pl-submission-panel-element): Displays the answer
  given by the student.

### Deprecated elements

!!! warning

    These elements have been **deprecated**. These elements are still supported for backwards
    compatibility, but they should not be used in new questions.

- [`pl-dropdown`](elements/deprecated-elements.md#pl-dropdown-element): Select an answer from answers in a drop-down box.
  - **Deprecated**: use [`pl-multiple-choice`](elements/submission-elements.md#pl-multiple-choice-element) with `display="dropdown"` for individual elements, or [`pl-matching`](elements/submission-elements.md#pl-matching-element) for multiple dropdowns with the same set of options.
- [`pl-prairiedraw-figure`](elements/deprecated-elements.md#pl-prairiedraw-figure-element): Show a PrairieDraw
  figure.
  - **Deprecated**: use [`pl-drawing`](elements/decorative-elements.md#pl-drawing-element) instead.
- [`pl-threejs`](elements/deprecated-elements.md#pl-threejs-element): Enables 3D scene display and problem
  submission.
  - **Deprecated**: the features of required libraries are no longer maintained.
- [`pl-variable-score`](elements/deprecated-elements.md#pl-variable-score-element): Displays a partial score
  for a submitted element.
  - **Deprecated** as submission elements in `v3` all have score display options.

### Documentation

- [Submission Elements](./elements/submission-elements.md)
- [Decorative Elements](./elements/decorative-elements.md)
- [Conditional Elements](./elements/conditional-elements.md)
- [Deprecated Elements](./elements/deprecated-elements.md)
