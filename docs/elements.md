# PrairieLearn Elements for use in `question.html`

When writing questions, there exists a core pool of elements that provides common structures associated with assessment items. These elements can be split into three distinct groups: **submission**, **decorative**, and **conditional**. Within this document, all of PrairieLearn's elements are displayed alongside links to sample elements within the example course. To build your own PrairieLearn element, please see [Question Element Writing](devElements.md) documentation.

**Submission** elements act as a way to receive a response or input from the student. These elements are traditionally referred to as form input fields. PrairieLearn presently provides the following templated **input field** elements:

- [`pl-big-o-input`](elements/pl-big-o-input.md): Fill in a **symbolic** value representing asymptotic input.
- [`pl-checkbox`](elements/pl-checkbox.md): Select **multiple options** from a list.
- [`pl-excalidraw`](elements/pl-excalidraw.md): Draw a **vector diagram** using [excalidraw](https://github.com/excalidraw/excalidraw).
- [`pl-file-editor`](elements/pl-file-editor.md): Provide an in-browser code editor for writing and submitting code.
- [`pl-file-upload`](elements/pl-file-upload.md): Provide a submission area to obtain a file with a specific naming scheme.
- [`pl-image-capture`](elements/pl-image-capture.md): Capture images of handwritten work from a local camera or external device such as a phone or tablet.
- [`pl-integer-input`](elements/pl-integer-input.md): Fill in an **integer** value such as -71, 0, 5, 21, and so on.
- [`pl-matching`](elements/pl-matching.md): Select a matching option for each entry in a group.
- [`pl-matrix-component-input`](elements/pl-matrix-component-input.md): Fill in a **matrix** using grid that has an input area for each element.
- [`pl-matrix-input`](elements/pl-matrix-input.md): Supply a matrix in a supported programming language format.
- [`pl-multiple-choice`](elements/pl-multiple-choice.md): Select only **one option** from a list.
- [`pl-number-input`](elements/pl-number-input.md): Fill in a **numerical** value within a specific tolerance level such as 3.14, -1.921, and so on.
- [`pl-order-blocks`](elements/pl-order-blocks.md): Select and arrange given blocks of code or text.
- [`pl-rich-text-editor`](elements/pl-rich-text-editor.md): Provide an in-browser formattable text editor for open-ended responses and essays.
- [`pl-string-input`](elements/pl-string-input.md): Fill in a **string** value such as `"Illinois"`, `"GATTACA"`, `"computer"`, and so on.
- [`pl-symbolic-input`](elements/pl-symbolic-input.md): Fill in a **symbolic** value such as `x^2`, `sin(z)`, `mc^2`, and so on.
- [`pl-units-input`](elements/pl-units-input.md): Fill in a **number** and a **unit** such as "1.5 m", "14 ms", "6.3 ft", and so on.

**Decorative** elements are meant to improve how the question is displayed to students. Elements under this category include ways to specify question markup, images, files, and code display. The following **decorative** elements are available:

- [`pl-card`](elements/pl-card.md): Display content within a card-styled component.
- [`pl-code`](elements/pl-code.md): Display code rendered with the appropriate syntax highlighting.
- [`pl-dataframe`](elements/pl-dataframe.md): Display DataFrames with various options.
- [`pl-drawing`](elements/pl-drawing.md): Create an image from pre-defined collection of graphic objects.
- [`pl-external-grader-variables`](elements/pl-external-grader-variables.md): Display expected and given variables for externally graded questions.
- [`pl-figure`](elements/pl-figure.md): Embed an image file in the question.
- [`pl-file-download`](elements/pl-file-download.md): Enable file downloads for data-centric questions.
- [`pl-file-preview`](elements/pl-file-preview.md): Display a preview of submitted files.
- [`pl-graph`](elements/pl-graph.md): Display graphs using [GraphViz DOT notation](https://graphviz.org/doc/info/lang.html), an adjacency matrix, or a [`networkx`](https://networkx.org/) graph.
- [`pl-matrix-latex`](elements/pl-matrix-latex.md): Display matrices using appropriate LaTeX commands for use in a mathematical expression.
- [`pl-overlay`](elements/pl-overlay.md): Layer existing elements on top of one another in specified positions.
- [`pl-python-variable`](elements/pl-python-variable.md): Display formatted output of Python variables.
- [`pl-variable-output`](elements/pl-variable-output.md): Display matrices in code form for supported programming languages.
- [`pl-template`](elements/pl-template.md): Display content from mustache templates.
- [`pl-xss-safe`](elements/pl-xss-safe.md): Remove potentially unsafe content from HTML code.

**Conditional** elements are meant to improve the feedback and question structure. These elements conditionally render their content depending on the question state. The following **Conditional** elements are available:

- [`pl-answer-panel`](elements/pl-answer-panel.md): Displays the correct answer to a given question.
- [`pl-external-grader-results`](elements/pl-external-grader-results.md): Displays results from questions that are externally graded.
- [`pl-hide-in-panel`](elements/pl-hide-in-panel.md): Hides content in one or more display panels.
- [`pl-hide-in-manual-grading`](elements/pl-hide-in-manual-grading.md): Hides content in the manual grading page.
- [`pl-hidden-hints`](elements/pl-hidden-hints.md): Displays hints as a student submits more on the current variant.
- [`pl-manual-grading-only`](elements/pl-manual-grading-only.md): Shows content only in manual grading.
- [`pl-question-panel`](elements/pl-question-panel.md): Displays the text of a question.
- [`pl-submission-panel`](elements/pl-submission-panel.md): Displays the answer given by the student.

Note: PrairieLearn Elements listed next have been **deprecated**. These elements are still supported for backwards compatibility, but they should not be used in new questions.

- [`pl-dropdown`](elements/pl-dropdown.md): Select an answer from answers in a drop-down box.
  - **Deprecated**: use [`pl-multiple-choice`](elements/pl-multiple-choice.md) with `display="dropdown"` for individual elements, or [`pl-matching`](elements/pl-matching.md) for multiple dropdowns with the same set of options.
- [`pl-prairiedraw-figure`](elements/pl-prairiedraw-figure.md): Show a PrairieDraw figure.
  - **Deprecated**: use [`pl-drawing`](elements/pl-drawing.md) instead.
- [`pl-threejs`](elements/pl-threejs.md): Enables 3D scene display and problem submission.
  - **Deprecated**: the features of required libraries are no longer maintained.
- [`pl-variable-score`](elements/pl-variable-score.md): Displays a partial score for a submitted element.
  - **Deprecated** as submission elements in `v3` all have score display options.

<script>
        (function() {
          // Mapping from old hash IDs on `elements.md` to new URLs.
          // Generated by docs/scripts/gen_elements_redirect_js.py
          var redirects = {
  "": "/elements/index/",
  "pl-answer-panel-element": "/elements/pl-answer-panel/",
  "pl-big-o-input-element": "/elements/pl-big-o-input/",
  "pl-card-element": "/elements/pl-card/",
  "pl-checkbox-element": "/elements/pl-checkbox/",
  "pl-code-element": "/elements/pl-code/",
  "pl-dataframe-element": "/elements/pl-dataframe/",
  "pl-drawing-element": "/elements/pl-drawing/",
  "pl-dropdown-element": "/elements/pl-dropdown/",
  "pl-excalidraw-element": "/elements/pl-excalidraw/",
  "pl-external-grader-results-element": "/elements/pl-external-grader-results/",
  "pl-external-grader-variables-element": "/elements/pl-external-grader-variables/",
  "pl-figure-element": "/elements/pl-figure/",
  "pl-file-download-element": "/elements/pl-file-download/",
  "pl-file-editor-element": "/elements/pl-file-editor/",
  "pl-file-preview-element": "/elements/pl-file-preview/",
  "pl-file-upload-element": "/elements/pl-file-upload/",
  "pl-graph-element": "/elements/pl-graph/",
  "pl-hidden-hints-element": "/elements/pl-hidden-hints/",
  "pl-hide-in-manual-grading-element": "/elements/pl-hide-in-manual-grading/",
  "pl-hide-in-panel-element": "/elements/pl-hide-in-panel/",
  "pl-image-capture-element": "/elements/pl-image-capture/",
  "pl-integer-input-element": "/elements/pl-integer-input/",
  "pl-manual-grading-only-element": "/elements/pl-manual-grading-only/",
  "pl-matching-element": "/elements/pl-matching/",
  "pl-matrix-component-input-element": "/elements/pl-matrix-component-input/",
  "pl-matrix-input-element": "/elements/pl-matrix-input/",
  "pl-matrix-latex-element": "/elements/pl-matrix-latex/",
  "pl-multiple-choice-element": "/elements/pl-multiple-choice/",
  "pl-number-input-element": "/elements/pl-number-input/",
  "pl-order-blocks-element": "/elements/pl-order-blocks/",
  "pl-overlay-element": "/elements/pl-overlay/",
  "pl-prairiedraw-figure-element": "/elements/pl-prairiedraw-figure/",
  "pl-python-variable-element": "/elements/pl-python-variable/",
  "pl-question-panel-element": "/elements/pl-question-panel/",
  "pl-rich-text-editor-element": "/elements/pl-rich-text-editor/",
  "pl-string-input-element": "/elements/pl-string-input/",
  "pl-submission-panel-element": "/elements/pl-submission-panel/",
  "pl-symbolic-input-element": "/elements/pl-symbolic-input/",
  "pl-template-element": "/elements/pl-template/",
  "pl-threejs-element": "/elements/pl-threejs/",
  "pl-units-input-element": "/elements/pl-units-input/",
  "pl-variable-output-element": "/elements/pl-variable-output/",
  "pl-variable-score-element": "/elements/pl-variable-score/",
  "pl-xss-safe-element": "/elements/pl-xss-safe/"
};

          var loc = window.location;
          var hash = loc.hash.replace(/^#/, "");

          // Prefer exact hash match; fall back to "" (no-hash) default if present.
          var hasExact = Object.prototype.hasOwnProperty.call(redirects, hash);
          var target = hasExact ? redirects[hash] : redirects[""];

          if (!target) {
            return; // no redirect configured
          }

          var url = new URL(target, loc.origin);

          // Preserve any query string (?foo=bar) from the original URL.
          if (loc.search) {
            url.search = loc.search;
          }

          // Avoid redirect loops.
          if (url.href === loc.href) {
            return;
          }

          window.location.replace(url.href);
        })();
</script>
