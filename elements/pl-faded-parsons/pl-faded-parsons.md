### to do

- can the timeout stuff be modularized into a separate JS file that is
conditionally loaded?

- 

### `pl-faded-parsons` element

A `pl-faded-parsons` element presents the student with a chunk of code
in which the lines are scrambled and must be placed in the correct
order (Parsons problem).  Some lines may also have blanks substituted for variable
names, keywords, etc. (hence Faded Parsons).

The instructor provides the reference solution, information regarding
what to "fade" and by how much, and one or more tests that are run to
evaluate the student's answer.

The element is based on the work of [Nathaniel
Weinman](https://www.cs.berkeley.edu/~nweinman) at UC Berkeley.

TBD: list contributors who helped with this element's implementation.

The question directory should include the following files in
`serverFilesQuestion/`:

* `code_lines.py` - the code that will be scrambled and shown to
student, including `!BLANK` wherever a blank should occur  (so
technically these lines are not valid Python).  Order doesn't matter.
If a line has a comment of the form `#0given`, this means that that
line should pre-populate the "solution" box at indent level zero (no
indent; subsequent indent levels are 1, 2, etc.)

* `test.py` - test cases to run against student code, with the single
entry point `test()`.  TBD we have to talk about how the grader generates output.
If we use the existing PL external Python grader (would be nice if it
just worked), it must generate its results in [this
format](https://prairielearn.readthedocs.io/en/latest/externalGrading/#grading-result). 
TBD can we control which test cases get run in  `test()` so we can
have (eg) hidden cases for exams, to be used after the student has
used the "basic" test cases for debugging?

* `solution.py` - This is what's shown to students on the solution
page for the problem if appropriate, but it doesn't affect
autograding.  This can be rendered, eg, as part of a
`pl-answer-panel` or similar feedback mechanism.

* `solution_notes.md` - If present, these comments/notes are displayed
along with the reference solution.  Markdown is allowed.

#### Sample element

TBD: replace this with a screenshot of the element in action; the png
file should eventually go in `PrairieLearn:PrairieLearn/docs/elements/pl-faded-parsons.png`

![](elements/pl-faded-parsons.png)

```html
<pl-question-panel>
  The problem prompt and description of the question goes here.
</pl-question-panel>

<pl-faded-parsons>
  You can put additional text here if you like, but the actual Parsons
  code boxes etc will be rendered automatically.
</pl-faded-parsons>
```

#### Customizations

Attribute | Type | Default | Description
--- | --- | --- | ---
`language`       | string  | "py"       | Language the problem is in, given as the filename extension for files in that language. Currently must be `py` (Python 3).
`answers-name`   | string  | "fp"       | Name of answers dict, only matters if >1 Faded Parsons element in same question
`partial-credit` | boolean | false      | Whether to give partial credit; see below.
`line-order`     | string  | "alpha"    | How to display the lines of code to the student: `alpha` (alphabetical order), `fixed` (exactly as they appear in `code_lines.py`), or `random`.

#### Example implementations


#### See also

- [`pl-order-blocks` for simple/non-coding problems involving putting things in order](#pl-order-blocks)
