# PrairieLearn Elements for use in `question.html`

When writing questions, there exists a core pool of elements that provides common structures associated with assessment items. These elements can be split into three distinct groups: **submission**, **decorative**, and **conditional**. Within this document, all of PrairieLearn's elements are displayed alongside links to sample elements within the example course. To build your own PrairieLearn element, please see [Question Element Writing](../devElements.md) documentation.

**Submission** elements act as a way to receive a response or input from the student. These elements are traditionally referred to as form input fields. PrairieLearn presently provides the following templated **input field** elements:

- [`pl-big-o-input`](pl-big-o-input.md): Fill in a **symbolic** value representing asymptotic input.
- [`pl-checkbox`](pl-checkbox.md): Select **multiple options** from a list.
- [`pl-excalidraw`](pl-excalidraw.md): Draw a **vector diagram** using [excalidraw](https://github.com/excalidraw/excalidraw).
- [`pl-file-editor`](pl-file-editor.md): Provide an in-browser code editor for writing and submitting code.
- [`pl-file-upload`](pl-file-upload.md): Provide a submission area to obtain a file with a specific naming scheme.
- [`pl-image-capture`](pl-image-capture.md): Capture images of handwritten work from a local camera or external device such as a phone or tablet.
- [`pl-integer-input`](pl-integer-input.md): Fill in an **integer** value such as -71, 0, 5, 21, and so on.
- [`pl-matching`](pl-matching.md): Select a matching option for each entry in a group.
- [`pl-matrix-component-input`](pl-matrix-component-input.md): Fill in a **matrix** using grid that has an input area for each element.
- [`pl-matrix-input`](pl-matrix-input.md): Supply a matrix in a supported programming language format.
- [`pl-multiple-choice`](pl-multiple-choice.md): Select only **one option** from a list.
- [`pl-number-input`](pl-number-input.md): Fill in a **numerical** value within a specific tolerance level such as 3.14, -1.921, and so on.
- [`pl-order-blocks`](pl-order-blocks.md): Select and arrange given blocks of code or text.
- [`pl-rich-text-editor`](pl-rich-text-editor.md): Provide an in-browser formattable text editor for open-ended responses and essays.
- [`pl-string-input`](pl-string-input.md): Fill in a **string** value such as `"Illinois"`, `"GATTACA"`, `"computer"`, and so on.
- [`pl-symbolic-input`](pl-symbolic-input.md): Fill in a **symbolic** value such as `x^2`, `sin(z)`, `mc^2`, and so on.
- [`pl-units-input`](pl-units-input.md): Fill in a **number** and a **unit** such as "1.5 m", "14 ms", "6.3 ft", and so on.

**Decorative** elements are meant to improve how the question is displayed to students. Elements under this category include ways to specify question markup, images, files, and code display. The following **decorative** elements are available:

- [`pl-card`](pl-card.md): Display content within a card-styled component.
- [`pl-code`](pl-code.md): Display code rendered with the appropriate syntax highlighting.
- [`pl-dataframe`](pl-dataframe.md): Display DataFrames with various options.
- [`pl-drawing`](../pl-drawing/index.md): Create an image from pre-defined collection of graphic objects.
- [`pl-external-grader-variables`](pl-external-grader-variables.md): Display expected and given variables for externally graded questions.
- [`pl-figure`](pl-figure.md): Embed an image file in the question.
- [`pl-file-download`](pl-file-download.md): Enable file downloads for data-centric questions.
- [`pl-file-preview`](pl-file-preview.md): Display a preview of submitted files.
- [`pl-graph`](pl-graph.md): Display graphs using [GraphViz DOT notation](https://graphviz.org/doc/info/lang.html), an adjacency matrix, or a [`networkx`](https://networkx.org/) graph.
- [`pl-matrix-latex`](pl-matrix-latex.md): Display matrices using appropriate LaTeX commands for use in a mathematical expression.
- [`pl-overlay`](pl-overlay.md): Layer existing elements on top of one another in specified positions.
- [`pl-python-variable`](pl-python-variable.md): Display formatted output of Python variables.
- [`pl-variable-output`](pl-variable-output.md): Display matrices in code form for supported programming languages.
- [`pl-template`](pl-template.md): Display content from mustache templates.
- [`pl-xss-safe`](pl-xss-safe.md): Remove potentially unsafe content from HTML code.

**Conditional** elements are meant to improve the feedback and question structure. These elements conditionally render their content depending on the question state. The following **Conditional** elements are available:

- [`pl-answer-panel`](pl-answer-panel.md): Displays the correct answer to a given question.
- [`pl-external-grader-results`](pl-external-grader-results.md): Displays results from questions that are externally graded.
- [`pl-hide-in-panel`](pl-hide-in-panel.md): Hides content in one or more display panels.
- [`pl-hide-in-manual-grading`](pl-hide-in-manual-grading.md): Hides content in the manual grading page.
- [`pl-hidden-hints`](pl-hidden-hints.md): Displays hints as a student submits more on the current variant.
- [`pl-manual-grading-only`](pl-manual-grading-only.md): Shows content only in manual grading.
- [`pl-question-panel`](pl-question-panel.md): Displays the text of a question.
- [`pl-submission-panel`](pl-submission-panel.md): Displays the answer given by the student.

!!! warning

    PrairieLearn Elements listed below have been **deprecated**. These elements are still supported for backwards compatibility, but they should not be used in new questions.

- [`pl-dropdown`](pl-dropdown.md): Select an answer from answers in a drop-down box.
  - **Deprecated**: use [`pl-multiple-choice`](pl-multiple-choice.md) with `display="dropdown"` for individual elements, or [`pl-matching`](pl-matching.md) for multiple dropdowns with the same set of options.
- [`pl-prairiedraw-figure`](pl-prairiedraw-figure.md): Show a PrairieDraw figure.
  - **Deprecated**: use [`pl-drawing`](../pl-drawing/index.md) instead.
- [`pl-variable-score`](pl-variable-score.md): Displays a partial score for a submitted element.
  - **Deprecated** as submission elements in `v3` all have score display options.

<!-- markdownlint-disable-next-line MD033 -->
<script>
(() => {
  const redirects = {
    'pl-answer-panel-element': 'pl-answer-panel/',
    'pl-big-o-input-element': 'pl-big-o-input/',
    'pl-card-element': 'pl-card/',
    'pl-checkbox-element': 'pl-checkbox/',
    'pl-code-element': 'pl-code/',
    'pl-dataframe-element': 'pl-dataframe/',
    'pl-drawing-element': '../pl-drawing/',
    'pl-dropdown-element': 'pl-dropdown/',
    'pl-excalidraw-element': 'pl-excalidraw/',
    'pl-external-grader-results-element': 'pl-external-grader-results/',
    'pl-external-grader-variables-element': 'pl-external-grader-variables/',
    'pl-figure-element': 'pl-figure/',
    'pl-file-download-element': 'pl-file-download/',
    'pl-file-editor-element': 'pl-file-editor/',
    'pl-file-preview-element': 'pl-file-preview/',
    'pl-file-upload-element': 'pl-file-upload/',
    'pl-graph-element': 'pl-graph/',
    'pl-hidden-hints-element': 'pl-hidden-hints/',
    'pl-hide-in-manual-grading-element': 'pl-hide-in-manual-grading/',
    'pl-hide-in-panel-element': 'pl-hide-in-panel/',
    'pl-image-capture-element': 'pl-image-capture/',
    'pl-integer-input-element': 'pl-integer-input/',
    'pl-manual-grading-only-element': 'pl-manual-grading-only/',
    'pl-matching-element': 'pl-matching/',
    'pl-matrix-component-input-element': 'pl-matrix-component-input/',
    'pl-matrix-input-element': 'pl-matrix-input/',
    'pl-matrix-latex-element': 'pl-matrix-latex/',
    'pl-multiple-choice-element': 'pl-multiple-choice/',
    'pl-number-input-element': 'pl-number-input/',
    'pl-order-blocks-element': 'pl-order-blocks/',
    'pl-overlay-element': 'pl-overlay/',
    'pl-prairiedraw-figure-element': 'pl-prairiedraw-figure/',
    'pl-python-variable-element': 'pl-python-variable/',
    'pl-question-panel-element': 'pl-question-panel/',
    'pl-rich-text-editor-element': 'pl-rich-text-editor/',
    'pl-string-input-element': 'pl-string-input/',
    'pl-submission-panel-element': 'pl-submission-panel/',
    'pl-symbolic-input-element': 'pl-symbolic-input/',
    'pl-template-element': 'pl-template/',
    'pl-units-input-element': 'pl-units-input/',
    'pl-variable-output-element': 'pl-variable-output/',
    'pl-variable-score-element': 'pl-variable-score/',
    'pl-xss-safe-element': 'pl-xss-safe/',
  };

  const loc = window.location;
  const hash = loc.hash.replace(/^#/, '').replace(/\/$/, '');
  const target = redirects[hash];

  console.log('hash', hash);
  console.log('target', target);

  if (!target) {
    return;
  }

  const url = new URL(target, loc.href);

  if (loc.search) {
    url.search = loc.search;
  }

  if (url.href === loc.href) {
    return;
  }

  window.location.replace(url.href);
})();
</script>
