
# Element developer guide

See [`elements/`](https://github.com/PrairieLearn/PrairieLearn/tree/master/question-servers/elements) for example elements.

Element code uses the libraries in [`freeformPythonLib/`](https://github.com/PrairieLearn/PrairieLearn/tree/master/question-servers/freeformPythonLib).

All element functions have the signature:

```python
def fcn(element_html, element_index, data)
```

The arguments are:

Argument | Type | Description
--- | --- | ---
`element_html` | string | The template HTML for the element.
`element_index` | integer | The number of the element in the template.
`data` | dict | Mutable data for the question, which can be modified and returned.

The `data` dictionary has the following possible keys (not all keys will be present in all element functions):

Key | Type | Description
--- | --- | ---
`data["params"]` | dict | Parameters that describe the question variant.
`data["correct_answers"]` | dict | The true answer (if any) for the variant.
`data["submitted_answers"]` | dict | The answer submitted by the student (after parsing).
`data["format_errors"]` | dict | Any errors encountered while parsign the student input.
`data["partial_scores"]` | dict | Partial scores for individual variables in the question.
`data["score"]` | float | The total final score for the question.
`data["feedback"]` | dict | Any feedback to the student on their submitted answer.
`data["variant_seed"]` | integer | The random seed for this question variant.
`data["options"]` | dict | Any options associated with the question.
`data["raw_submitted_answers"]` | dict | The answer submitted by the student before parsing.
`data["editable"]` | boolean | Whether the question is currently in an editable state.
`data["panel"]` | string | Which panel is being rendered (`question`, `submisison`, or `answer`).

So that multiple elements can exist together in one question, the convention is that each element instance is associated with one or more **variables**. These variables are keys in the dictionaries for the data elements. For example, if there are variables `x` and `y` then we might have:

```python
data["correct_answers"]["x"] = 4
data["correct_answers"]["y"] = 7
data["submitted_answers"]["x"] = 4
data["submitted_answers"]["y"] = 12
```

This structure, where dictionaries have variables as keys, is used for all dictionaries in `data`.

The element functions are:

Function | Return object | modifiable `data` keys | unmodifiable `data` keys | Description
--- | --- | --- | --- | ---
`generate()` | `data` (dict) | `params`, `correct_answers` | `variant_seed`, `options` | Generate the parameter and true answers for a new random question variant. Set `data["params"][name]` and `data["correct_answers"][name]` for any variables as needed. Return the modified `data` dictionary.
`prepare()` | `data` (dict) | `params`, `correct_answers` | `variant_seed`, `options` | Final question preparation after element code has run. Can modify data as necessary. Return the modified `data` dictionary.
`render()` | `html` (string) | `params`, `correct_answers`, `submitted_answers`, `format_errors`, `partial_scores`, `score`, `feedback` `variant_seed`, `options`, `raw_submitted_answers`, `editable`, `panel` | Render the HTML for one panel and return it as a string.
`parse()` | `data` (dict) | `submitted_answers`, `format_errors` | `params`, `correct_answers`, `variant_seed`, `options`, `raw_submitted_answers` | Parse the `data["submitted_answers"][var]` data entered by the student, modifying this variable. Return the modified `data` dictionary.
`grade()` | `data` (dict) | `params`, `correct_answers`, `submitted_answers`, `format_errors`, `partial_scores`, `score`, `feedback` | `variant_seed`, `options`, `raw_submitted_answers` | Grade `data["submitted_answers"][var]` to determine a score. Store the score and any feedback in `data["partial_scores"][var]["score"]` and `data["partial_scores"][var]["feedback"]`. Return the modified `data` dictionary.

The above function descriptions describe the typical variables that will be read and modified by each function. However, any function that returns `data` (i.e., not `parse()`) is allowed to change any of the modifiable values in `data` (see above table) and these changes will be persisted to the database. No function is allowed to add or delete keys in `data`.

### Element dependencies

It's likely that your element will depend on certain client-side assets,
such as scripts or stylesheets. To keep clean separation of HTML, CSS, and JS,
you can place those dependencies in other files. If you depend on libraries like
lodash or d3, you can also express that need. PrairieLearn will compile a list
of all dependencies needed by all elements on a page, dedup the dependencies,
and ensure they are loaded on the page.

Dependencies are listed in `question-servers/elements/index.js`. You can
configure them for your element as follows:

```javscript
module.exports.dependencies = {
    'pl_my_element': {
        'globalScripts': [
            'lodash.min.js',
            'dropzone.js'
        ],
        'styles': [
            'pl_my_element.css'
        ]
    }
};
```

Any global resources will map to the url `/javascripts/[filename]`. Non-global
resources will map to the url `/pl/static/elements/[filename]`; PrairieLearn
will serve any CSS or JS files in `question-servers/elements/` at that url. In
the above example, the file is located at `question-servers/elements/pl_my_element.css`,
and it will be served at `/pl/static/elements/pl_my_element.css`.
