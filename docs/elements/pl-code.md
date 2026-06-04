# `pl-code` element

Display an embedded or file-based block of code with syntax highlighting and
line callouts.

## Sample element

![Screenshot of the pl-code input](pl-code.png)

<!-- prettier-ignore -->
```html title="question.html"
<pl-code language="python">
def square(x):
    return x * x
</pl-code>
```

## Customizations

| Attribute               | Type    | Default         | Description                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| ----------------------- | ------- | --------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `copy-code-button`      | boolean | false           | Whether to include a button to copy the code displayed by this element.                                                                                                                                                                                                                                                                                                                                                                                   |
| `directory`             | string  | See description | Directory where the source file with existing code is to be found. Only useful if `source-file-name` is used. If it contains one of the special names `"clientFilesCourse"` or `"serverFilesCourse"`, then the source file name is read from the course's special directories, otherwise the directory is expected to be in the question's own directory. If not provided, the source file name is expected to be found in the question's main directory. |
| `highlight-lines`       | string  | —               | Apply a distinctive background highlight the specified lines of code. Accepts input like `4`, `1-3,5-10`, and `1,2-5,20`.                                                                                                                                                                                                                                                                                                                                 |
| `highlight-lines-color` | string  | `"#b3d7ff"`     | Specifies the color of highlighted lines of code.                                                                                                                                                                                                                                                                                                                                                                                                         |
| `language`              | string  | —               | The programming language syntax highlighting to use. See below for options.                                                                                                                                                                                                                                                                                                                                                                               |
| `normalize-whitespace`  | boolean | false           | Whether to strip trailing whitespace and remove extra indentation of the contents. Recommended for cases where the code is inline in the question file.                                                                                                                                                                                                                                                                                                   |
| `prevent-select`        | boolean | false           | Applies methods to make the source code more difficult to copy, like preventing selection or right-clicking. Note that the source code is still accessible in the page source, which will always be visible to students. Also note that preventing operations like selecting or copying text may be detrimental to the student's experience, and as such should be avoided unless absolutely necessary.                                                   |
| `show-line-numbers`     | boolean | false           | Whether to show line numbers in code displayed by this element.                                                                                                                                                                                                                                                                                                                                                                                           |
| `source-file-name`      | string  | —               | Name of the source file with existing code to be displayed as a code block (instead of writing the existing code between the element tags as illustrated in the above code snippet).                                                                                                                                                                                                                                                                      |
| `style-name`            | string  | `"friendly"`    | The name of the Pygments style to use. A sample of valid styles can be found in the [Pygments documentation](https://pygments.org/styles/).                                                                                                                                                                                                                                                                                                               |

## Details

The `pl-code` element uses the _Pygments_ library for syntax highlighting. It supports any of the built-in supported languages found in the [Pygments documentation](https://pygments.org/languages/), as well as the custom [`ansi-color` custom language](https://github.com/chriskuehl/pygments-ansi-color) that can be used to display terminal output. If the language is not provided, no syntax highlighting is done.

### Common Pitfalls

The HTML specification disallows inserting special characters onto the page (i.e. `<`, `>`, `&`), and using these characters with inline code may break rendering. To fix this, either escape the characters (`&lt;`, `&gt;`, `&amp;`, more with [this escaping tool](https://www.freeformatter.com/html-entities.html)), or load code snippets from external files into `pl-code` with `source-file-name` attribute.

## Example implementations

- [element/code]

## See also

- [`pl-file-editor` to provide an in-browser code environment](pl-file-editor.md)

---

[element/code]: https://github.com/PrairieLearn/PrairieLearn/tree/master/exampleCourse/questions/element/code
