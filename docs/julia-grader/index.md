# Julia Autograder

This page documents the `prairielearn/grader-julia` Docker image for externally graded Julia
questions. The image supports two authoring styles:

- a PLTestCase-style flow for exported functions, values, and object checks;
- a standard Julia `Test`-style flow for ordinary `@test` and `@test_throws` assertions.

The grader generates real Julia wrapper files at runtime from the question's test sources, then
executes those generated files after the student submission has been loaded.

## Setting up

### `info.json`

Enable external grading and point the question at the Julia image:

```json title="info.json"
{
  "uuid": "...",
  "title": "...",
  "topic": "...",
  "tags": ["..."],
  "type": "v3",
  "singleVariant": true,
  "gradingMethod": "External",
  "externalGradingOptions": {
    "image": "prairielearn/grader-julia",
    "timeout": 20,
    "environment": {
      "JULIA_STUDENT_FILE": "student.jl"
    }
  }
}
```

The `JULIA_STUDENT_FILE` environment variable is optional. If it is omitted, the grader looks for a
submission file named `student.jl`, or falls back to the only `.jl` file in the student
submission directory.

### `question.html`

Most Julia questions will use a file editor, file upload, or workspace submission. The grader
results should be displayed in the submission panel:

```html title="question.html"
<pl-question-panel>
  <pl-file-editor file-name="student.jl" ace-mode="ace/mode/julia"></pl-file-editor>
</pl-question-panel>

<pl-submission-panel>
  <pl-external-grader-results></pl-external-grader-results>
  <pl-file-preview></pl-file-preview>
</pl-submission-panel>
```

## Test files

The grader discovers Julia source files from `tests/` and turns each one into a generated wrapper
file before execution. The generated wrappers are ephemeral and do not need to be committed.

If you want to override the default filenames or the source-file ordering, you may add an optional
`tests/manifest.toml` file with entries like:

```toml title="tests/manifest.toml"
student_file = "student.jl"
answer_file = "answer.jl"
setup_file = "setup.jl"
sources = ["exported/fib.jl", "macro/basic.jl"]
```

A typical question layout is:

```text
tests/
  setup.jl
  answer.jl
  exported/
    fib.jl
  macro/
    basic.jl
```

### `tests/setup.jl`

Use `setup.jl` for shared helper code and shared values. The file is evaluated before the student
and reference modules are loaded. If you define `repeated_setup()`, the grader will call it before
each test iteration.

### `tests/answer.jl`

For exported-style questions, `answer.jl` may define the reference solution that the tests compare
against.

### `tests/exported/*.jl`

Exported-style tests use `pl_testcase(...) do ... end`. The grader injects the globals `student`,
`reference`, and `data` into the test module, so the body can compare student and reference
results directly.

```julia title="tests/exported/fib.jl"
pl_testcase("fib(5)"; points = 2) do
    check_scalar("fib(5)", reference.fib(5), student.fib(5))
end

pl_testcase("fib(8)"; points = 2) do
    if check_scalar("fib(8)", reference.fib(8), student.fib(8))
        set_score!(1)
    else
        set_score!(0)
    end
end
```

### `tests/macro/*.jl`

Macro-style tests use standard Julia assertion syntax inside `pl_testset(...) do ... end` blocks.
The grader exports `@test` and `@test_throws`, so the file can look like a normal Julia test file.

```julia title="tests/macro/basic.jl"
pl_testset("basic math"; points = 3) do
    @test student.add(1, 1) == 2
    @test_throws DomainError student.reciprocal(0)
end
```

## Runtime behavior

The grader:

1. copies the question tests and student submission into `/grade/run`;
2. generates wrapper files and a manifest for the discovered Julia tests;
3. loads the setup, student, and reference code;
4. executes the generated wrappers; and
5. writes PrairieLearn results JSON to `/grade/results/results.json`.

Because the wrappers are generated and then removed before the student code is executed, the test
sources do not remain visible to the submission during grading.
