# Element developer guide

See [`elements/`](https://github.com/PrairieLearn/PrairieLearn/tree/master/apps/prairielearn/elements) for example elements.

Element code uses the libraries in [the `python/` module](https://github.com/PrairieLearn/PrairieLearn/tree/master/apps/prairielearn/python).

### Anatomy of an element

The system-wide elements available in the current build of the PrairieLearn server
live in `[PrairieLearn directory]/elements` inside a folder corresponding to the element name.
You can also have course-specific elements in a directory inside
the root of your course repository, such as `[course directory]/elements`.
See [`exampleCourse/elements`](https://github.com/PrairieLearn/PrairieLearn/tree/master/exampleCourse/elements)
for a real example of this.

By convention,
all element files are named the same as the element they belong to. That directory
should contain an `info.json` file that contains metadata about the element, including
which file is the element controller and any dependencies of the element. See [the section on dependencies](#element-dependencies) for more information

Each element should have a `.py` controller that contains the functions listed
in the next section. This controller is responsible for rendering the element,
parsing the student's submission, and optionally grading the submission.

As a simple example, element `pl-my-element` would have the following file
structure:

```
pl-my-element
+-- info.json
|-- pl-my-element.py
|-- pl-my-element.mustache
|-- pl-my-element.js
`-- pl-my-element.css
```

And an `info.json` with the following contents:

```json
{
  "controller": "pl-my-element.py",
  "dependencies": {
    "elementScripts": ["pl-my-element.js"],
    "elementStyles": ["pl-my-element.css"]
  }
}
```

### Element functions

All element functions are of the following form:

```python
def fcn(element_html, data):
```

Note that not all functions have the same return type. The arguments are:

| Argument       | Type   | Description                                                        |
| -------------- | ------ | ------------------------------------------------------------------ |
| `element_html` | string | The template HTML for the element.                                 |
| `data`         | dict   | Mutable data for the question, which can be modified and returned. |

The `data` dictionary has the following possible keys (not all keys will be present in all element functions):

| Key                             | Type    | Description                                                                                                                                         |
| ------------------------------- | ------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| `data["correct_answers"]`       | dict    | The true answer (if any) for the variant.                                                                                                           |
| `data["editable"]`              | boolean | Whether the question is currently in an editable state.                                                                                             |
| `data["extensions"]`            | dict    | A list of extensions that are available to be loaded by this element. For more information see the [element extensions](elementExtensions.md) page. |
| `data["feedback"]`              | dict    | Any feedback to the student on their submitted answer.                                                                                              |
| `data["format_errors"]`         | dict    | Any errors encountered while parsing the student input.                                                                                             |
| `data["manual_grading"]`        | boolean | Whether the question is being rendered in the manual grading view.                                                                                  |
| `data["num_valid_submissions"]` | int     | The number of valid (not containing format errors) submissions by the student for the current variant.                                              |
| `data["options"]`               | dict    | Any options associated with the question.                                                                                                           |
| `data["panel"]`                 | string  | Which panel is being rendered (`question`, `submission`, or `answer`).                                                                              |
| `data["params"]`                | dict    | Parameters that describe the question variant.                                                                                                      |
| `data["partial_scores"]`        | dict    | Partial scores for individual variables in the question.                                                                                            |
| `data["raw_submitted_answers"]` | dict    | The answer submitted by the student before parsing.                                                                                                 |
| `data["score"]`                 | float   | The total final score for the question.                                                                                                             |
| `data["submitted_answers"]`     | dict    | The answer submitted by the student (after parsing).                                                                                                |
| `data["variant_seed"]`          | integer | The random seed for this question variant.                                                                                                          |

So that multiple elements can exist together in one question, the convention is that each element instance is associated with one or more **variables**. These variables are keys in the dictionaries for the data elements. For example, if there are variables `x` and `y` then we might have:

```python
data["correct_answers"]["x"] = 4
data["correct_answers"]["y"] = 7
data["submitted_answers"]["x"] = 4
data["submitted_answers"]["y"] = 12
```

This structure, where dictionaries have variables as keys, is used for all dictionaries in `data`.

The element functions are:

| Function     | Return object | Modifiable `data` keys                                                                                   | Unmodifiable `data` keys                                                                                                                                                                                                                    | Description                                                                                                                                                                                                                                                                                                                                                                      |
| ------------ | ------------- | -------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `generate()` | `None`        | `correct_answers`, `params`                                                                              | `extensions`, `options`, `variant_seed`                                                                                                                                                                                                     | Generate the parameter and true answers for a new random question variant. Set `data["params"][name]` and `data["correct_answers"][name]` for any variables as needed. Return the modified `data` dictionary.                                                                                                                                                                    |
| `prepare()`  | `None`        | `correct_answers`, `params`                                                                              | `extensions`, `options`, `variant_seed`                                                                                                                                                                                                     | Final question preparation after element code has run. Can modify data as necessary. Return the modified `data` dictionary.                                                                                                                                                                                                                                                      |
| `render()`   | `str` (html)  |                                                                                                          | `correct_answers`, `editable`, `extensions`, `feedback`, `format_errors`, `manual_grading`, `num_valid_submissions`, `options`, `panel`, `params`, `partial_scores`, `raw_submitted_answers`, `score`, `submitted_answers`, `variant_seed`, | Render the HTML for one panel and return it as a string.                                                                                                                                                                                                                                                                                                                         |
| `parse()`    | `None`        | `correct_answers`, `feedback`, `format_errors`, `submitted_answers`                                      | `extensions`, `options`, `params`, `raw_submitted_answers`, `variant_seed`                                                                                                                                                                  | Parse the `data["submitted_answers"][var]` data entered by the student, modifying this variable. Return the modified `data` dictionary.                                                                                                                                                                                                                                          |
| `grade()`    | `None`        | `correct_answers`, `feedback`, `format_errors`, `params`, `partial_scores`, `score`, `submitted_answers` | `extensions`, `options`, `raw_submitted_answers`, `variant_seed`                                                                                                                                                                            | Grade `data["submitted_answers"][var]` to determine a score. Store the score and any feedback in `data["partial_scores"][var]["score"]` and `data["partial_scores"][var]["feedback"]` respectively. Return the modified `data` dictionary. **Note:** Avoid modifying the `data["feedback"]` dictionary, as this is meant to be used by custom questions.                         |
| `test()`     | `None`        | `format_errors`, `partial_scores`, `raw_submitted_answers`, `score`                                      | `extensions`, `gradable`, `test_type`                                                                                                                                                                                                       | Creates a test submission for this element, used when running tests from the "Settings" panel. Should set a value in `data["raw_submitted_answers"][var]` and expected score in `data["partial_scores"][var]` (or `data["format_errors"][var]` if `invalid`). The type of input to test is given in `data["test_type"]`, and can be one of `correct`, `incorrect`, or `invalid`. |

The above function descriptions describe the typical variables that will be read and modified by each function. However, any function that returns `data` (i.e., not `parse()`) is allowed to change any of the modifiable values in `data` (see above table) and these changes will be persisted to the database. No function is allowed to add or delete keys in `data`.

### Element dependencies

It's likely that your element will depend on certain client-side assets, such as scripts or stylesheets. To keep clean separation of HTML, CSS, and JS, you can place those dependencies in other files. If you depend on libraries like `lodash` or `d3`, you can also link to node modules containing these libraries. PrairieLearn will compile a list of all dependencies needed by all elements on a page, deduplicate the dependencies, and ensure they are loaded on the page.

Dependencies are listed in your element's `info.json`. You can configure them for your element as follows:

```json
{
  "controller": "pl-my-element.py",
  "dependencies": {
    "nodeModulesScripts": ["three/build/three.min.js"],
    "elementScripts": ["pl-my-element.js"],
    "elementStyles": ["pl-my-element.css"],
    "clientFilesCourseStyles": ["courseStylesheet1.css", "courseStylesheet2.css"]
  }
}
```

The different types of dependency properties currently available are summarized in this table:

| Property                   | Description                                                                                                                                                                                                                     |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `nodeModulesStyles`        | The styles required by this element, relative to `[PrairieLearn directory]/node_modules`.                                                                                                                                       |
| `nodeModulesScripts`       | The scripts required by this element, relative to `[PrairieLearn directory]/node_modules`.                                                                                                                                      |
| `elementStyles`            | The styles required by this element relative to the element's directory, which is either `[PrairieLearn directory]/elements/this-element-name` or `[course directory]/elements/this-element-name`.                              |
| `elementScripts`           | The scripts required by this element relative to the element's directory, which is either `[PrairieLearn directory]/elements/this-element-name` or `[course directory]/elements/this-element-name`.                             |
| `clientFilesCourseStyles`  | The styles required by this element relative to `[course directory]/clientFilesCourse`. _(Note: This property is only available for elements hosted in a specific course's directory, not system-wide PrairieLearn elements.)_  |
| `clientFilesCourseScripts` | The scripts required by this element relative to `[course directory]/clientFilesCourse`. _(Note: This property is only available for elements hosted in a specific course's directory, not system-wide PrairieLearn elements.)_ |

The `coreScripts` and `coreStyles` properties are used in legacy elements and questions, but are deprecated and should not be used in new objects. It lists scripts and styles required by this element, relative to `[PrairieLearn directory]/public/javascripts` and `[PrairieLearn directory]/public/stylesheets`, respectively. Scripts in `[PrairieLearn directory]/public/javascripts` are mainly used for compatibility with legacy elements and questions, while styles in `[PrairieLearn directory]/public/stylesheets` are reserved for [styles used by specific pages rather than individual elements](dev-guide.md#html-style).

While the use of node module dependencies in course elements is supported, it is recommended that caution be used when doing so. In particular, note that node modules may be updated without warning, which in some cases may break your element. If your code relies on a particular version of a node module, it is recommended that you copy the module into your element directory or `courseFilesCourse` and link to that module from there instead.

In addition to static dependencies, elements can also declare dynamic dependencies, corresponding to scripts that are loaded only if they are deemed necessary. For example, if an element may use the `d3` library, but only in certain cases, it can declare a dependency on `d3`:

```json
{
  "controller": "pl-my-element.py",
  "dependencies": {
    "elementScripts": ["pl-my-element.js"]
  },
  "dynamicDependencies": {
    "nodeModulesScripts": { "d3": "d3/dist/d3.min.js" }
  }
}
```

Then, the element's own script (e.g., `pl-my-element.js`) can dynamically import the `d3` library only when considered necessary:

```javascript
if (options.use_d3) {
  import('d3').then((module) => {
    // use d3 here
  });
}
```

Dynamic dependencies are implemented using [import maps](https://developer.mozilla.org/en-US/docs/Web/HTML/Element/script/type/importmap), which allow the `import` call in the element script to refer to the module by the name defined in the `info.json` file instead of the full URL. Dynamic dependencies may point to:

| Property                   | Description                                                                                                                                                                                                                     |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `nodeModulesScripts`       | The scripts required by this element, relative to `[PrairieLearn directory]/node_modules`.                                                                                                                                      |
| `elementScripts`           | The scripts required by this element relative to the element's directory, which is either `[PrairieLearn directory]/elements/this-element-name` or `[course directory]/elements/this-element-name`.                             |
| `clientFilesCourseScripts` | The scripts required by this element relative to `[course directory]/clientFilesCourse`. _(Note: This property is only available for elements hosted in a specific course's directory, not system-wide PrairieLearn elements.)_ |

Note that the key used in the dynamic dependencies will be shared among all elements available in a question. For example, if two elements in a question both declare a dynamic dependency on `d3`, then the `d3` library will only be loaded once, even if both elements use it. For this reason, it is important that the following convention is used when defining keys for dynamic dependencies:

- For node modules: use the name of the module, as defined in the `package.json` file. This will allow multiple elements that use the same module to share the same dependency without loading the module twice.
- For element scripts: use the name of the element, followed by a slash, followed by the name of the script. For example, if the element is named `pl-my-element` and the script is named `my-element.js`, then the key should be `pl-my-element/my-element.js`.
- For `clientFilesCourse` scripts: use any course-specific convention that does not clash with the naming above.

You can also find the types of dependencies defined in these schema files:

- [Schema for system-wide elements](https://github.com/PrairieLearn/PrairieLearn/blob/master/apps/prairielearn/src/schemas/schemas/infoElementCore.json)
- [Schema for course-specific elements](https://github.com/PrairieLearn/PrairieLearn/blob/master/apps/prairielearn/src/schemas/schemas/infoElementCourse.json)
