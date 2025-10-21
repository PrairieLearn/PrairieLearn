# External Grading

PrairieLearn allows you to securely run custom grading scripts in environments that you specify. This is mainly used to enable the automatic grading of submitted code, but it's flexible enough to support a variety of use cases.

## High-level overview

You can define a number of resources for the external grading process:

- A Docker image to execute your tests in
- A script or command line to serve as an entrypoint to your grading process
- Files that are shared between questions
- Tests for individual questions

When a student clicks "Submit" on an externally-graded question, PrairieLearn will assemble all of those resources that you've defined into an archive. That archive will be submitted to be run as a job on AWS infrastructure inside the environment that you specify. Results are then sent back to PrairieLearn; once they are processed, the student will immediately be show their score, individual test cases, `stdout`/`stderr`, and any information you want to show to them.

## External grading timestamps and phases

An external grading job goes through various phases and the times when these phases start are recorded in the grading job. These are:

```text
--- Timestamp 1: grading_requested_at (reported by PrairieLearn)
        ^
        | Phase 1: submit
        |
        | PrairieLearn writes the grading job information to S3
        | and puts the job on the grading queue.
        v
--- Timestamp 2: grading_submitted_at (reported by PrairieLearn)
        ^
        | Phase 2: queue
        |
        | The job waits on the grading queue until received by a grader.
        v
--- Timestamp 3: grading_received_at (reported by PrairieGrader)
        ^
        | Phase 3: prepare
        |
        | The grader reads the grading information from S3,
        | writes it to local disk, pulls the appropriate grading
        | Docker image, and starts the grading container.
        v
--- Timestamp 4: grading_started_at (reported by PrairieGrader)
        ^
        | Phase 4: run
        |
        | The course grading code runs inside the Docker container.
        v
--- Timestamp 5: grading_finished_at (reported by PrairieGrader)
        ^
        | Phase 4: report
        |
        | The grader sends the grading results back to PrairieLearn.
        v
--- Timestamp 6: graded_at (reported by PrairieLearn)
```

## Configuring and enabling external grader support

External grading configuration is done on a per-question basis. All configuration is done via the `externalGradingOptions` object in a question's `info.json`. The options you can configure are as follows:

- `enabled`: Whether external grading is enabled for the question. If not present, external grading will be disabled by default. This can be used as a kill switch if things start breaking.

- `image`: The Docker image that should be used for the question. This can be any image specification that is understood by the `docker pull` command. This property is required.

- `entrypoint`: The script or command line that will be run when your container starts. This should be an absolute path to something that is executable in the Docker image; this could take the form of a shell script, a python script, a compiled executable, or anything else that can be run like that. This file can be built into your image, which must be executable in the image itself; or it can be one of the files that will be mounted into `/grade` (more on that later), in which case the entrypoint file is given executable permission by the grading process itself before running (i.e., `chmod +x /path/to/entrypoint && /path/to/entrypoint`). If this property is not provided, the default entrypoint of the Docker image will be used.
  - The `entrypoint` may also be provided with additional command line arguments. These may be provided either as a string (e.g., `"/path/to/entrypoint -h"`) or as an array, with each element corresponding to an argument (e.g., `["/path/to/entrypoint", "-h"]`).

- `serverFilesCourse`: Specifies a list of files or directories that will be copied from a course's `serverFilesCourse` into the grading job. This can be useful if you want to share a standard grading framework between many questions. This property is optional.

- `timeout`: Specifies a timeout for the grading job in seconds. If grading has not completed after that time has elapsed, the job will be killed and reported as a failure to the student. This is optional and defaults to 30 seconds. This should be as small as is reasonable for your jobs. This value cannot exceed 600 seconds (10 minutes).

- `enableNetworking`: Allows the container to access the public internet. This is disabled by default to make secure, isolated execution the default behavior.

- `environment`: Environment variables to set inside the grading container. Set variables using `{"VAR": "value", ...}`, and unset variables using `{"VAR": null}` (no quotes around `null`). This property is optional.

See the [`externalGradingOptions` schema for `infoQuestion.json`](./schemas/infoQuestion.md/#properties/externalGradingOptions) for more information about these fields.

Here's an example of a complete `externalGradingOptions` portion of a question's `info.json`:

```json title="info.json"
{
  "externalGradingOptions": {
    "enabled": true,
    "image": "prairielearn/grader-python",
    "serverFilesCourse": ["python_autograder/"],
    "entrypoint": "/grade/serverFilesCourse/python_autograder/run.sh",
    "timeout": 5
  }
}
```

This config file specifies the following things:

- External grading is enabled
- The `prairielearn/grader-python` image will be used
- The files/directories under `serverFilesCourse/python_autograder` will be copied into your image while grading
- The script `/grade/serverFilesCourse/python_autograder/run.sh` will be executed when your container starts up
- If grading takes longer than 5 seconds, the container will be killed

### Special directories

There are several ways that you can load files from PrairieLearn into your container if you don't want to build the files directly into your image.

As specified above, you can specify files or directories in `serverFilesCourse` that should be copied into your container. A common use case for this is if you want to share a single grading framework between different questions.

You can also put a `tests` directory into your question's directory; these could be question-specific tests that run on your grading framework above. You could also put standalone tests here if you don't feel the need to share any test code between questions.

## The Grading Process

All question and student-submitted code will be present in various subdirectories in `/grade` inside your container.

- If you specify any files or directories in `serverFilesCourse`, they will be copied to `/grade/serverFilesCourse`
- If your question has a `tests` directory, it will be copied to `/grade/tests`
- Files submitted by the student will be copied to `/grade/student`
- The `data` object that would normally be provided to the `grade` method of your question's server file will be serialized to JSON at `/grade/data/data.json`

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
|
+-- /...                       # Additional directories and files as needed.
```

When your container starts up, your `entrypoint` script will be executed. After that, you can do whatever you want. The only requirement is that by the time that script finished, you should have written results for the grading job to `/grade/results/results.json`. The format for this file is specified below. The contents of that file will be sent back to PrairieLearn to record a grade and possibly be shown to students.

!!! note

    The `/grade/results` directory is not automatically created, so you must create it yourself before writing `results.json`.

## Directory layout

To utilize external grading, you'll need the following:

- `info.json` for each question must enable external grading

The following is an example of a well-structured course layout:

```text
/course             # the root directory of your course
+-- /questions           # all questions for the course
|   `-- /addVector
|       +-- info.json           # required configuration goes here (see below)
|       |-- ...                 # some other question files
|       `-- /tests              # directory of test cases
|           +-- ag.py           # testing files
|           `-- soln_out.txt
|
+-- /serverFilesCourse                  # files that will be shared between questions
|   +-- /my_testing_framework           # related files can be grouped into directories
|   |   +-- file1
|   |   `-- file2
|   `-- /my_library
|       `-- ...
```

## Grading results

Your grading process must write its results to `/grade/results/results.json`. If the submission is gradable, the result only has one mandatory field: `score`, which is the score for the submitted attempt, and should be a floating point number in the range [0.0, 1.0]. If the submission is not gradable (see below) then the `score` field is unneeded.

As long as this field is present you may add any additional data to that object that you want. This could include information like detailed test results, stdout/stderr, compiler errors, rendered plots, and so on. Note, though, that this file should be limited to 1 MB, so you must ensure any extensive use of data takes this limit into account.

The boolean `gradable` can be added to the results object and set to `false` to indicate that the input was invalid or formatted incorrectly, for example if it has a syntax error that prevented compilation. If `"gradable": false` is set then the submission will be marked as "invalid, not gradable", no points will be awarded or lost, and the student will not be penalized an attempt on the question. The omission of this field is equivalent to assuming that the input was gradable (`"gradable": true`).

If `gradable` is set to false, error messages related to the formatting of the answer can be added to the grading results by setting the `format_errors` key. This can be either a string or an array of strings, depending on the number of error messages.

The `<pl-external-grader-results>` element is capable of rendering a list of tests with associated test names, descriptions, point values, output, and messages. Here's an example of well-formed results that can be rendered by this element:

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

Plots or images can be added to either individual test cases or to the main output by adding `base64` encoded images to their respective `images` array, as listed in the examples above, provided the resulting file respects the size limit of 1 MB listed above. Each element of the array is expected to be either an object containing the following keys:

- `url`: The source of the image, typically formatted as standard HTML base64 image like `"data:[mimetype];base64,[contents]"`;
- `label`: An optional label for the image (defaults to "Figure").

For compatibility with older versions of external graders, the object may be replaced with a string containing only the URL.

A reference Python implementation for this can be seen in `PrairieLearn/graders/python/python_autograder`. See the [grader documentation](python-grader/index.md) for more details.

## Writing questions

To enable students to submit files, you can use one of PrairieLearn's file elements. `<pl-file-editor>` gives students an in-browser editor that they can use to write code. `<pl-file-upload>` allows students to upload files from their own computer. For examples of both style of question, you can look at `PrairieLearn/exampleCourse/questions/fibonacciEditor` and `PrairieLearn/exampleCourse/questions/fibonacciUpload`. For questions using workspaces, [the `gradedFiles` option](https://prairielearn.readthedocs.io/en/latest/workspaces/#infojson-for-externally-graded-workspace) identifies workspace files that will be made available to the external grader.

If you want to write your own submission mechanism (as a custom element, for instance), you can do that as well. We expect files to be present in a `_files` array on the `submitted_answers` dict. They should be represented as objects containing the `name` of the file and base-64 encoded `contents`. Here's an example of a well-formed `_files` array:

```json
{
  "_files": [
    {
      "name": "fib.py",
      "contents": "ZGVmIGZpYihuKToNCiAgaWYgKG4gPT0gMCk6DQogICAgICByZXR1cm4gMA0KICBlbGlmIChuID09IDEpOg0KICAgICAgcmV0dXJuIDENCiAgZWxzZToNCiAgICAgIHJldHVybiBmaWIobiAtIDEpICsgZmliKG4gLSAyKQ=="
    },
    {
      "name": "anotherFile.py",
      "contents": "base64EncodedFileGoesHere"
    }
  ]
}
```

For a working example of this, see [the implementation of `pl-file-upload`](https://github.com/PrairieLearn/PrairieLearn/blob/master/apps/prairielearn/elements/pl-file-upload/pl-file-upload.py).

## Running locally for development

In order to run external graders in a local Docker environment, the `docker` command must include options that support the creation of local "sibling" containers. Detailed instructions on how to run Docker can be found in the [installation instructions](installing.md#support-for-external-graders-and-workspaces).

When not running in Docker, things are easier. The Docker socket can be used normally, and we're able to store job files automatically without setting `HOST_JOBS_DIR`. By default, they are stored in `$HOME/.pljobs`. However, if you run PrairieLearn with an environment variable `JOBS_DIR=/abs/path/to/my/custom/jobs/directory/`, that directory will be used instead. Note that this environment variable has no effect when running on Docker, in which case the jobs directory is specified using `HOST_JOBS_DIR` instead of `JOBS_DIR`.
