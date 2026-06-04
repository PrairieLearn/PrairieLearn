# `pl-xss-safe` element

Removes potentially dangerous scripts from HTML. This is recommended when parsing and displaying student-provided content. The element will remove some elements like scripts and triggers that may have been maliciously inserted by the student. Note that any code parsed by this element must be supported directly by the browser, i.e., it cannot include PrairieLearn elements or special tags.

## Sample element

```html title="question.html"
<!-- Content coming from a submitted file (e.g., pl-file-editor, pl-file-upload) -->
<pl-xss-safe submitted-file-name="answer.html"></pl-xss-safe>

<!-- Content coming from a regular element (e.g., pl-string-input) -->
<pl-xss-safe contents="{{submitted_answers.answer}}"></pl-xss-safe>
```

## Customizations

| Attribute             | Type   | Default | Description                                                                                                                                                   |
| --------------------- | ------ | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `contents`            | string | —       | Raw contents to be displayed.                                                                                                                                 |
| `language`            | string | html    | Language of the provided code. The values "html" or "markdown" are currently supported.                                                                       |
| `source-file-name`    | string | —       | Name of the source file with existing code to be used (instead of using the existing code between the element tags as illustrated in the above code snippet). |
| `submitted-file-name` | string | —       | Name of the file submitted by the user to (typically using a `pl-file-editor` or `pl-file-upload` element) with the code to be used.                          |

Note that only one of the attributes `source-file-name`, `submitted-file-name` or `contents` may be provided in the same element.

## Example implementations

- [demo/markdownEditorLivePreview]
- [element/xssSafe]

## See also

- [`pl-file-editor` to provide an in-browser code environment](pl-file-editor.md)

[demo/markdowneditorlivepreview]: https://github.com/PrairieLearn/PrairieLearn/tree/master/exampleCourse/questions/demo/markdownEditorLivePreview
[element/xsssafe]: https://github.com/PrairieLearn/PrairieLearn/tree/master/exampleCourse/questions/element/xssSafe
