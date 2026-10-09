# `pl-workspace` element

Embeds a workspace launcher in the question that allows for code that needs a richer environment (multiple files, a terminal, an IDE, or a build/run loop). See the [workspace](../workspaces/index.md) documentation for full details of how to configure a workspace.

## Sample element

```html title="question.html"
<!-- embed a workspace launcher into the question -->
<pl-workspace></pl-workspace>

<!-- embed a workspace launcher into the question with custom labelling -->
<pl-workspace label="Open IDE"></pl-workspace>
```

## Customizations

| Attribute | Type   | Default          | Description                                 |
| --------- | ------ | ---------------- | ------------------------------------------- |
| `label`   | string | "Open workspace" | The text displayed on the workspace button. |

## Example implementations

- [demo/workspace/vscode-python]
- [demo/workspace/rstudio]

## See also

- [`pl-file-editor` to provide an in-browser code environment](pl-file-editor.md)

[demo/workspace/vscode-python]: https://github.com/PrairieLearn/PrairieLearn/tree/master/exampleCourse/questions/demo/workspace/vscode-python
[demo/workspace/rstudio]: https://github.com/PrairieLearn/PrairieLearn/tree/master/exampleCourse/questions/demo/workspace/rstudio
