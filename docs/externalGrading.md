# External Grading

PrairieLearn allows you to securely run custom grading scripts in environments that you specify. This is mainly used to enable the automatic grading of submitted code, but it's flexible enough to support a variety of use cases.

## High-level overview

You can define a number of resources for the external grading process:

- A Docker image to execute your tests in, which may be:
  - A PrairieLearn-provided image.
  - A custom version of a PrairieLearn-provided image that you've built and pushed to Docker Hub.
  - A standard public image from Docker Hub (e.g., `python:3.13`, `node:24`, etc.) that can execute course-specific grading scripts.
  - A completely custom image containing scripts and resources that you've built and pushed to Docker Hub.
- Files, scripts and other resources that are shared between questions.
- Files, scripts, tests and other resources that are specific to individual questions.

When a student clicks "Submit" on an externally-graded question, PrairieLearn will assemble all of those resources that you've defined into an archive. That archive will be submitted to be run inside the environment that you specify. Results are then sent back to PrairieLearn; once they are processed, the student will immediately be shown their score, individual test cases, `stdout`/`stderr`, and any information you want to show to them.

## External grading timestamps and phases

When a student submits to a question that uses external grading, a grading job is created to handle the submission. A pool of graders is available to handle these jobs. The grading job then follows a series of steps:

1. PrairieLearn creates the grading job and puts the job on the grading queue.
2. The job waits on the grading queue until it is received by a grader.
3. A grader from the pool receives the job, reads the grading information, pulls the appropriate grading Docker image, and starts the grading container.
4. The course grading code runs inside the Docker container.
5. The grader sends the grading results back to PrairieLearn.
6. PrairieLearn processes the results, records the grade, and shows the student their results.

The timestamps for each individual phase of the grading process are recorded and can be viewed by instructors in the submission info box for each submission, as well as the grading job page. This can be useful for debugging issues with grading performance.

## Configuring and enabling external grader support

External grading configuration is done on a per-question basis. The question needs to be set to use the 'External' grading method. All configuration may be done using the question settings page, or via the `externalGradingOptions` object in a question's `info.json`. A minimal configuration for an externally-graded question includes the following two options:

- `enabled`: Whether external grading is enabled for the question. Setting this value to `false` can be used as a kill switch if things start breaking.

- `image`: The Docker image that should be used for the question. This can be any image hosted publicly on Docker Hub. This property is required when external grading is enabled.

Additional options are available for further customization:

- `entrypoint`: The script or command line that will be run when your container starts. If this property is not provided, the default entrypoint of the Docker image will be used.
  - If specified, this should be an absolute path to something that is executable in the Docker image. This could be a shell script, a Python script, a compiled executable, or anything else that can be executed. This file can be built into your image, which must be executable in the image itself; or it can be one of the files that will be mounted into `/grade` (more on that later), in which case the entrypoint file is given executable permission by the grading process itself before running (i.e., `chmod +x /path/to/entrypoint && /path/to/entrypoint`).
  - The `entrypoint` may also be provided with additional command line arguments. If set via `info.json`, these may be provided either as a string (e.g., `"/path/to/entrypoint -h"`) or as an array, with each element corresponding to an argument (e.g., `["/path/to/entrypoint", "-h"]`).

- `serverFilesCourse`: Specifies a list of files or directories that will be copied from a course's `serverFilesCourse` into the grading job. This can be useful if you want to share standard resources, such as scripts, libraries, and data files, between many questions. This property is optional.

- `timeout`: Specifies a timeout for the grading job in seconds. If grading has not completed after that time has elapsed, the job will be killed and reported as a failure to the student. This property is optional and defaults to 30 seconds. It should be as small as is reasonable for your jobs, and cannot exceed 600 seconds (10 minutes).

- `enableNetworking`: Allows the container to access the public internet. This is disabled by default to make secure, isolated execution the default behavior.

- `environment`: Environment variables to set inside the grading container. Set variables using `{"VAR": "value", ...}`, and unset variables using `{"VAR": null}` (no quotes around `null`). This property is optional.

Here's an example of a complete `externalGradingOptions` portion of a question's `info.json`:

```json title="info.json"
{
  "externalGradingOptions": {
    "enabled": true,
    "image": "prairielearn/grader-python",
    "serverFilesCourse": ["my_libraries/"],
    "timeout": 5
  }
}
```

This config file specifies the following things:

- External grading is enabled.
- The `prairielearn/grader-python` image will be used.
- The files/directories under `serverFilesCourse/my_libraries` will be copied into your image while grading.
- The default entrypoint script set by the image will be executed when your container starts up.
- If grading takes longer than 5 seconds, the container will be killed.

!!! info

    See the [`externalGradingOptions` schema for a question `info.json` file](./schemas/infoQuestion.md/#properties/externalGradingOptions) for more information about how to set these fields in the `info.json` file.

### Writing questions

There are multiple ways to allow students to submit files for external grading:

- The [`pl-file-editor` element](./elements/pl-file-editor.md) gives students an in-browser editor that they can use to write code.
- The [`pl-file-upload` element](./elements/pl-file-upload.md) allows students to upload files from their own computer.
- The [`pl-order-blocks` element](./elements/pl-order-blocks.md), using the `grading-method="external"` attribute, allows students to submit code by arranging pre-defined blocks of code in the correct order.
- The [`pl-rich-text-editor` element](./elements/pl-rich-text-editor.md) allows students to create HTML documents.
- The [`pl-image-capture` element](./elements/pl-image-capture.md) allows students to submit images taken with their device's camera.
- For questions using [workspaces](./workspaces/index.md), [the `gradedFiles` option](workspaces/index.md#infojson-for-externally-graded-workspace) identifies workspace files that will be made available to the external grader.

For examples of questions that allow student submissions, you can look at [`PrairieLearn/exampleCourse/questions/demo/autograder/codeEditor`](https://github.com/PrairieLearn/PrairieLearn/tree/master/exampleCourse/questions/demo/autograder/codeEditor) and [`PrairieLearn/exampleCourse/questions/demo/autograder/codeUpload`](https://github.com/PrairieLearn/PrairieLearn/tree/master/exampleCourse/questions/demo/autograder/codeUpload).

If you want to write your own submission mechanism (as a custom element, for instance), you can do that as well. Files may be submitted to external graders by including them in a `_files` array on the `submitted_answers` dict. This can be done by [calling `pl.add_submitted_file()`](./python-reference/prairielearn/question_utils.md#prairielearn.question_utils.add_submitted_file) in the `parse()` method of your question or custom element. For a working example of this, see [the implementation of `pl-file-upload`](https://github.com/PrairieLearn/PrairieLearn/blob/master/apps/prairielearn/elements/pl-file-upload/pl-file-upload.py).

### Special directories

Inside the question directory, you can create a `tests` directory containing any question-specific files that you want to make available to the external grading container. These may be individual tests, input files, code files or library files that will be used during the grading process. The format of these files may vary depending on the grading image you are using.

Additionally, as listed above, you can specify files or directories in `serverFilesCourse` that should be copied into your container. A common use case for this is if you want to share a library, script or data file across different questions in the course.

!!! warning

    Any files included in `tests` or in the specified `serverFilesCourse` directories will be copied to the grading job every time a submission is made. If you include large files or directories, this may slow down the grading process significantly. We recommend only including files that are necessary for grading. If you have large files that are shared between many questions, consider [building them into a custom Docker image](./dockerImages.md#custom-variations-of-maintained-images) instead.

## The Grading Process

All question and student-submitted code will be present in various subdirectories in `/grade` inside your container.

- If you specify any files or directories in `serverFilesCourse`, they will be copied to `/grade/serverFilesCourse`.
- If your question has a `tests` directory, it will be copied to `/grade/tests`.
- Files submitted by the student will be copied to `/grade/student`.
- The `data` object that would normally be provided to the `grade` method of your question's server file will be serialized to JSON at `/grade/data/data.json`.

When your container starts up, the entrypoint script (either the default one set by the image or the one specified in the question settings) will be executed. The only requirement is that by the time that script finishes, it should have written results for the grading job to `/grade/results/results.json`. The format for this file is specified below. The contents of that file will be sent back to PrairieLearn to record a grade and possibly be shown to students.

!!! note

    The `/grade/results` directory is not automatically created, so you must create it yourself before writing `results.json`.

In particular, the file system structure of the grader looks like:

```text
/grade                         # Root directory of the grading job
+-- /data                      # JSON dump of the data object from server.py
|   `-- data.json
|
+-- /results                   # Report of test output formatted for PrairieLearn
|   `-- results.json
|
+-- /serverFilesCourse         # Files from serverFilesCourse/ in the course directory
|   +-- /my_testing_framework
|   |   +-- testfile           # Test framework configuration
|   |   `-- run.sh             # Entrypoint called in the container
|
+-- /student                   # Files submitted by student
|   +-- studentfile1
|   `-- studentfile2
|
+-- /tests                     # Files found in the question's tests/ directory
|   +-- test1
|   `-- test2
```

### Grading results

Your grading process must write its results to `/grade/results/results.json`.

- If the submission is gradable, the result only has one mandatory field: `score`, which is the score for the submitted attempt, and should be a floating-point number in the range [0.0, 1.0]. The field `gradable` may be optionally included and set to `true` to indicate that the submission was gradable, though this is not required, as the omission of this field is equivalent to assuming that the input was gradable.
- If the submission is not gradable, the field `gradable` is required, and must be set to `false`. In this case, the `score` field is not needed. This indicates that the submission could not be graded, for example due to a syntax error, or if the input was missing, invalid, or formatted incorrectly. In this case, the submission will be marked as "invalid, not gradable", no points will be awarded or lost, and the student will not be penalized an attempt on the question.

Other than `score` and `gradable`, you may add any additional data to that object that you want. This could include information like detailed test results, stdout/stderr, compiler errors, rendered plots, and so on. Note, though, that this file should be limited to 1 MB, so you must ensure any extensive use of data takes this limit into account.

If `gradable` is set to false, error messages related to the formatting of the answer can be added to the grading results by setting the `format_errors` key. This can be either a string or an array of strings, depending on the number of error messages.

The [`<pl-external-grader-results>` element](./elements/pl-external-grader-results.md) is capable of rendering a list of tests with associated test names, descriptions, point values, output, and messages. Here is an example of well-formed results that can be rendered by this element. Note that all fields other than `score` (or `gradable`) are optional.

```json
{
  "gradable": true,
  "score": 0.25,
  "message": "Tests completed successfully.",
  "output": "Running tests...\nTest 1 passed\nTest 2 failed!\n...",
  "images": [
    {
      "label": "First Image",
      "url": "data:image/png;base64,..."
    },
    {
      "label": "Second Image",
      "url": "data:image/jpeg;base64,..."
    }
  ],
  "tests": [
    {
      "name": "Test 1",
      "description": "Tests that a thing does a thing.",
      "points": 1,
      "max_points": 1,
      "message": "No errors!",
      "output": "Running test...\nYour output matched the expected output!"
    },
    {
      "name": "Test 2",
      "description": "Like Test 1, but harder, you'll probably fail it.",
      "points": 0,
      "max_points": 3,
      "message": "Make sure that your code is doing the thing correctly.",
      "output": "Running test...\nYour output did not match the expected output.",
      "images": [
        {
          "label": "First Image",
          "url": "data:image/gif;base64,..."
        },
        {
          "label": "First Image",
          "url": "data:image/png;base64,..."
        }
      ]
    }
  ]
}
```

Plots or images can be added to either individual test cases or to the main output by adding [base64-encoded data URLs](https://developer.mozilla.org/en-US/docs/Web/URI/Reference/Schemes/data) to their respective `images` array, as listed in the examples above, provided the resulting file respects the size limit of 1 MB listed above. Each element of the array is expected to be an object containing the following keys:

- `url`: The source of the image, typically formatted as standard data URL like `"data:[mimetype];base64,[contents]"`.
- `label`: An optional label for the image (defaults to "Figure").

For compatibility with older versions of external graders, the object may be replaced with a string containing only the URL.

## Running locally for development

In order to run external graders in a local Docker environment, the `docker` command must include options that support the creation of local "sibling" containers. Detailed instructions on how to run Docker can be found in the [installation instructions](installing.md#support-for-external-graders-and-workspaces). More details on testing custom images locally can be found in the [Docker images documentation](dockerImages.md).

When not running in Docker, things are easier. The Docker socket can be used normally, and we're able to store job files automatically without setting `HOST_JOBS_DIR`. By default, they are stored in `$HOME/.pljobs`. However, if you run PrairieLearn with an environment variable `JOBS_DIR=/abs/path/to/my/custom/jobs/directory/`, that directory will be used instead. Note that this environment variable has no effect when running on Docker, in which case the jobs directory is specified using `HOST_JOBS_DIR` instead of `JOBS_DIR`.
