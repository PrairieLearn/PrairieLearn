# `pl-template` element

Displays boilerplate HTML from mustache templates in a reusable way.

## Sample element

```html title="question.html"
<pl-template file-name="templates/outer_template.mustache">
  <pl-variable name="show">True</pl-variable>
  <pl-variable name="section_header">This is the section header.</pl-variable>
  <pl-variable name="section_body">This is the section body.</pl-variable>
</pl-template>
```

Along with the sample usage of the element, we include a sample template file. This is the file
`templates/outer_template.mustache`, stored in the course's `serverFilesCourse` directory:

```html title="templates/outer_template.mustache"
<div class="card mb-1 mt-1">
  <div class="card-header" style="cursor: pointer">
    <div
      class="card-title d-flex justify-content-between"
      data-bs-toggle="collapse"
      data-bs-target="#collapse-{{uuid}}"
    >
      <div>{{section_header}}</div>
      <div class="fa fa-angle-down"></div>
    </div>
  </div>

  <div class="collapse{{#show}} show{{/show}}" id="collapse-{{uuid}}">
    <div class="card-body">
      <div class="card-text">{{{section_body}}}</div>
    </div>
  </div>
</div>
```

!!! note

    The sample element did not define the `uuid` variable, as each `pl-template` element
    has a unique one defined internally.

## Customizations

| Attribute               | Type                                                                                                      | Default               | Description                                                                                                  |
| ----------------------- | --------------------------------------------------------------------------------------------------------- | --------------------- | ------------------------------------------------------------------------------------------------------------ |
| `directory`             | `"question"`, `"clientFilesQuestion"`, `"clientFilesCourse"`, `"serverFilesCourse"`, `"courseExtensions"` | `"serverFilesCourse"` | Parent directory to locate `file-name`.                                                                      |
| `file-name`             | string                                                                                                    | —                     | File name of the outer template to use.                                                                      |
| `log-tag-warnings`      | boolean                                                                                                   | true                  | Whether to log warnings if a rendered template contains elements which are not guaranteed to work correctly. |
| `log-variable-warnings` | boolean                                                                                                   | false                 | Whether to log warnings when rendering templates with undefined variables. Useful for debugging.             |

Inside the `pl-template` element, variables for use in rendering the template may be specified with a `pl-variable` tag. Each `pl-variable` tag can be used to define a variable with data from a file or with the contents of the tag (but not both). Note that substitution is **not** applied to external files used in `pl-variable` (files are used as-is). The `pl-variable` tag supports the following attributes:

| Attribute         | Type                                                                                                      | Default               | Description                                                   |
| ----------------- | --------------------------------------------------------------------------------------------------------- | --------------------- | ------------------------------------------------------------- |
| `directory`       | `"question"`, `"clientFilesQuestion"`, `"clientFilesCourse"`, `"serverFilesCourse"`, `"courseExtensions"` | `"serverFilesCourse"` | Parent directory to locate `file-name`.                       |
| `file-name`       | string                                                                                                    | —                     | File name to use if variable data is being taken from a file. |
| `name`            | string                                                                                                    | —                     | Variable name to assign the data defined by this tag.         |
| `trim-whitespace` | boolean                                                                                                   | true                  | Whether to trim whitespace of data specified by this tag.     |

## Details

Because of the way that elements are rendered in PrairieLearn, templates should only contain other decorative elements. In particular, **elements that accept and/or grade student input used within this element will not work correctly.** When rendering a template, all entries from `data["params"]` are included as available variables and may be used when the template is rendered. Each instance of the `pl-template` element also has a unique `uuid` variable available for rendering. Templates may also be used within other templates.

!!! note

    The id `#` CSS selector does _not_ work for ids that start with a number, so uuids should be prefixed (as these may start with a number).

## Example implementations

- [element/template]

---

[element/template]: https://github.com/PrairieLearn/PrairieLearn/tree/master/exampleCourse/questions/element/template
