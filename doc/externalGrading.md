# External Grading

PrairieLearn allows you to securely run custom grading scripts in environments that you specify. This is mainly used to enable the automatic grading of submitted code, but it's flexible enough to support a variety of use cases.

## High-level overview

You can define a number of resources for the external grading process:

* A Docker image to execute your tests in
* A script to serve as an entrypoint to your grading process
* Files that are shared between questions
* Tests for individual questions

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

* `enabled`: Whether or not external grading is enabled for the question. If not present, external grading will be disabled by default. This can be used as a kill switch if things start breaking.

* `image`: The Docker image that should be used for the question. This can be any image specification that is understood by the `docker pull` command. This property is required.

* `entrypoint`: The script that will be run when your container starts. This should be an absolute path to something that is executable via `chmod +x /path/to/entrypoint && /path/to/entrypoint`; this could take the form of a shell script, a python script, a compiled executable, or anything else that can be run like that. This file can be built into your image, or it can be one of the files that will be mounted into `/grade` (more on that later). This property is required.

* `serverFilesCourse`: Specifies a list of files or directories that will be copied from a course's `serverFilesCourse` into the grading job. This can be useful if you want to share a standard grading framework between many questions. This property is optional.

* `timeout`: Specifies a timeout for the grading job in seconds. If grading has not completed after that time has elapsed, the job will be killed and reported as a failure to the student. This is optional and defaults to 30 seconds. This should be as small as is reasonable for your jobs.

* `enableNetworking`: Allows the container to access the public internet. This is disabled by default to make secure, isolated execution the default behavior.

Here's an example of a complete `externalGradingOptions` portion of a question's `info.json`:

```json
"externalGradingOptions": {
    "enabled": true,
    "image": "prairielearn/centos7-python",
    "serverFilesCourse": ["python_autograder/"],
    "entrypoint": "/grade/serverFilesCourse/python_autograder/run.sh",
    "timeout": 5
}
```

This config file specifies the following things:

* External grading is enabled
* The `prairielearn/centos7-python` image will be used
* The files/directories under `serverFilesCourse/python_autograder` will copied into your image while grading
* The script `/grade/serverFilesCourse/python_autograder/run.sh` will be executed when your container starts up
* If grading takes longer that 5 seconds, the container will be killed

#### Special directories

There are several ways that you can load files from PrairieLearn into your container if you don't want to build the files directly into your image.

As specified above, you can specify files or directories in `serverFilesCourse` that should be copied into your container. A common use case for this is if you want to share a single grading framework between many different questions.

You can also put a `tests` directory into your question's directory; these could be question-specific tests that run on your grading framework above. You could also put standalone tests here if you don't feel the need to share any test code between questions.

## The Grading Process

All question and student-submitted code will be present in various subdirectories in `/grade` inside your container.

* If you specify any files or directories in `serverFilesCourse`, they will be copied to `/grade/serverFilesCourse`
* If your question has a `tests` directory, it will be copied to `/grade/tests`
* Files submitted by the student will be copied to `/grade/student`
* The `data` object that would normally be provided to the `grade` method of your question's server file will be serialized to JSON at `/grade/data/data.json`

When your container starts up, your `entrypoint` script will be executed. After that, you can do whatever you want. The only requirement is that by the time that script finished, you should have written results for the grading job to `/grade/results/results.json`; the format for this is specified below. The contents of that file will be sent back to PrairieLearn to record a grade and possibly be shown to students.

## Directory layout

To utilize external grading, you'll need the following:

* `info.json` for each question must enable external grading

The following is an example of a well-structured course layout:

```text
/course             # the root directory of your course
+-- /questions           # all questions for the course
|   `-- /addVector
|       +-- info.json           # required configuration goes here (see below)
|       |-- ...                 # some other question files
|       `-- /tests              # folder of test cases
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

Your grading process must write its results to `/grade/results/results.json`. The result only has 2 mandatory fields: `succeeded` and `score`. `succeeded` indicates if the tests were able to run successfully, or if they failed due to some error. `score` is the score, and should be a floating point number in the range [0.0, 1.0].

As long as those two fields are present, you may add any additional data to that object that you want. This could include information like detailed test results, stdout/stderr, compiler errors, rendered plots, and so on.

The `<pl-external-grader-results>` element is capable of rendering a list of tests with associated test names, descriptions, point values, output, and messages. Here's an example of well-formed results that can be rendered by this element:

```json
{
   "succeeded": true,
   "score": 0.25,
   "message": "Tests completed successfully.",
   "output": "Running tests...\nTest 1 passed\nTest 2 failed!\n...",
   "tests": [
      {
         "name": "Test 1",
         "description": "Tests that a thing does a thing.",
         "points": 1,
         "max_points": 1,
         "message": "No errors!",
         "output": "Running test...\nYour output matched the expected output!",
      },
      {
         "name": "Test 2",
         "description": "Like Test 1, but harder, you'll probably fail it.",
         "points": 0,
         "max_points": 3,
         "message": "Make sure that your code is doing the thing correctly.",
         "output": "Running test...\nYour output did not match the expected output."
      }
   ]
}
```

## Writing questions

To enable students to submit files, you can use one of PrairieLearn's file elements. `<pl-file-editor>` gives students an in-browser editor that they can use to write code. `<pl-file-upload>` allows students to upload files from their own computer. For examples of both style of question, you can look at `PrairieLearn/exampleCourse/questions/fibonacciEditor` and `PrairieLearn/exampleCourse/questions/fibonacciUpload`.

If you want to write your own submission mechanism (as a custom element, for instance), you can do that as well. We expect files to be present in a `_files` array on the `submitted_answers` dict. They should be represented as objects containing the `name` of the file and base-64 encoded `contents`. Here's an example of a well-formed `_files` array:

```json
"_files": [
    {
        "name": "fib.py",
        "contents": "ZGVmIGZpYihuKToNCiAgaWYgKG4gPT0gMCk6DQogICAgICByZXR1cm4gMA0KICBlbGlmIChuID09IDEpOg0KICAgICAgcmV0dXJuIDENCiAgZWxzZToNCiAgICAgIHJldHVybiBmaWIobiAtIDEpICsgZmliKG4gLSAyKQ=="
    }, {
        "name": "anotherFile.py",
        "contents": "base64EncodedFileGoesHere"
    }
]
```

For a working example of this, see `PrairieLearn/elements/pl_file_upload/pl_file_upload.py`.

## Running locally for development

In production, PrairieLearn runs external grading jobs on a distributed system called [https://github.com/PrairieLearn/PrairieGrader](PrairieGrader). This system uses a variety of AWS services to efficiently run many jobs in parallel. When developing questions locally, you won't have access to this infrastructure, but PrairieLearn allows you to still run external grading jobs locally with a few workarounds.

* Instead of running jobs on an EC2 instance, they will be run locally and directly with Docker on the host machine.
* Instead of sending jobs to the grading containers with S3, we write them to a directory on the host machine and then mount that directory directly into the grading container as `/grade`.
* Instead of receiving a webhook to indicate that results are available, PrairieLearn will simply wait for the grading container to die, and then attempt to read `results/results.json` from the folder that was mounted in as `/grade`.

PrairieLearn supports two ways of running on your own machine: natively, and inside a Docker container. We support running external autograders for each way. If the `HOST_JOBS_DIR` environment variable is set (more on that later), PrairieLearn will assume it's running in a container; otherwise, it assumes it's running natively.

#### Running locally (on Docker)

We have to do a couple interesting things to run external grading jobs when PrairieLearn is running locally inside Docker:

* We need a way of starting up Docker containers on the host machine from within another Docker container. We achieve this by mounting the Docker socket from the host into the Docker container running PrairieLearn; this allows us to run 'sibling' containers.
* We need to get job files from inside the Docker container running PrairieLearn to the host machine so that Docker can mount them to `/grade` on the grading machine. We achieve this by mounting a directory on the host machine to `/jobs` on the grading machine, and setting an environment variable `HOST_JOBS_DIR` containing the absolute path of that directory on the host machine.

Running PrairieLearn locally with externally graded question support looks something like this:

1. Create an empty directory to use to share job data between containers. This can live anywhere, but
needs to be created first and referenced in the docker launch command.
    * i.e. `mkdir $HOME/pl_ag_jobs`
1. Modify your PL docker run call to look something like:
```sh
docker run -it --rm -p 3000:3000 \
    -v $PWD:/course \                # Map your current directly in as course content
    -v $HOME/pl_ag_jobs:/jobs \      # Map jobs directory into /jobs
    -e HOST_JOBS_DIR=$HOME/pl_ag_jobs \
    -v /var/run/docker.sock:/var/run/docker.sock \ # Mount docker into itself so container can spawn others
    prairielearn/prairielearn        # PL docker image itself
```

Note: The sequence above works on Windows 10 as well as MacOS and Linux docker. Windows users might see problems running grading jobs:

* A `standard_init_linux.go:207: exec user process caused "no such file or directory"` error when
grading likely means a OS new-line incompatibility with the `entrypoint` script in the externally
graded question.
    * One solution for this is to make a `.gitattributes` files in your PL repository with the line
`*.sh text eol=lf`. This tells the GitHub client to write the script files in native Linux
format instead of converting them for Windows (which breaks mapping them back into docker). This mimics the [.gitattributes file in the main PrairieLearn repo](https://github.com/PrairieLearn/PrairieLearn/blob/master/.gitattributes).

#### Running locally (native, not on Docker)

When not running in Docker, things are easier. The Docker socket can be used normally, and we're able to store job files automatically. By default, they are stored in `$HOME/pl_ag_jobs` on Unix-based systems and `$USERPROFILE/pl_ag_jobs` on Windows. However, if you run PrairieLearn with a an environment variable `JOBS_DIR=/abs/path/to/my/custom/directory/`, that directory will be used instead. Note that this environment variable has no effect when running on Docker.
