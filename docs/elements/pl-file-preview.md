### `pl-file-preview` element

Provides an in-browser list of all files submitted by a student through submission elements like `pl-file-editor`, `pl-file-upload`, and `pl-rich-text-editor`, or through [workspaces](../workspaces/index.md). A preview of each file's content is also displayed for text-only files (including source code), images, PDF files and Jupyter Notebooks. It is commonly used in the submission panel in conjunction with the `pl-external-grader-results` element, though it can also be used when manual or internal grading is used to grade files.

#### Sample element

```html
<pl-file-preview></pl-file-preview>
```

#### Example implementations

- [element/fileEditor]
- [demo/autograder/codeEditor]

#### See also

- [`pl-file-editor` to provide an in-browser code environment](pl-file-editor.md)
- [`pl-file-upload` to receive files as a submission](pl-file-upload.md)
- [`pl-external-grader-results` to include output from autograded code](pl-external-grader-results.md)
- [`pl-code` to display blocks of code with syntax highlighting](pl-code.md)
- [`pl-xss-safe` to display HTML or Markdown code provided by students](pl-xss-safe.md)

---

[demo/autograder/codeeditor]: https://github.com/PrairieLearn/PrairieLearn/tree/master/exampleCourse/questions/demo/autograder/codeEditor
[element/fileeditor]: https://github.com/PrairieLearn/PrairieLearn/tree/master/exampleCourse/questions/element/fileEditor
