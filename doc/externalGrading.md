# External Grading

PrairieLearn allows you to securely run custom grading scripts in environments that you specify. The main use case for this is to support the automatic grading of submitted code, but it's flexible enough to support a variety of use cases.

## High-level Overview

You can define a number of resources for the external grading process:
* A Docker image to execute your tests in
* An script to serve as an entrypoint to your grading process
* Files that are shared between questions
* Tests for individual questions

When a student clicks "Submit" on an externally-graded question, PrairieLearn will assemble all of those resources that you've defined into an archive. That archive will be submitted to be run as a job on AWS infrasctructure inside the environment that you specify. Results are then sent back to PrairieLearn; once they are processed, the student can refresh the page to see their score, individual test cases, `stdout`/`stderr`, and more.

## The Grading Process

PrairieLearn external grading is set up to enable courses to use their existing grading infrastructure. All external grading jobs will be run in self-contained Docker containers (you can think of them as lightweight VMs) which can be configured to a course's specifications.

External grading configuration is split into three components: an image, an entrypoint script, shared files, and tests. All of these are specified inside the `externalGradingOptions` object of a question's `info.json` as follows.

You must specify an image to be used for your question with the `image` property. Note that this image should be hosted on a service like Dockerhub so that AWS Batch will be able to pull down the image when running your job. See **Enabling External Grading for a Question** below for more details on this.

Your Docker image should use one of our base images (see `PrairieLearn/environments`) in its `FROM` directive. This is crucial, as our base image contains a Python script that will load the job files from S3, unzip them, run your specified scripts, upload the results back to S3, and notify PrairieLearn that the results are available. If you really don't wish to extend from our image, you'll have to duplicate the actions of our script in your own image. The following base images are available on Dockerhub:

* `prairielearn/centos7-base`

Similar to the way that files in `clientFilesCourse` can be shared among multiple questions, you can specify shared resources inside the `externalGradingFilesCourse` directory of a course; the resources to include are specified in the `files` array, similar to the `clientFiles` array in a question. Note that externally graded questions allow you to specify whole directories, not just individual files as with `clientFiles`. Typically, this directory would hold files to be shared between a large number of questions, such as testing frameworks or libraries.

Each externally graded question can contain a directory called `tests` that contains any files that are specific to that test. If you include a testing framework from `externalGradingFilesCourse`, the `tests` directory would then hold test cases that can be run with that framework.

When we receive a new submission for an externally graded question, we will package up all of the resources you specify and send your grading job to be executed on AWS infrastructure. Our Docker image contains a "driver" script that will coordinate fetching the files for your job, running your script, and sending results back to PrairieLearn. That script will set up the directory structure on the Docker container as follows:

```
/grade
+-- tests                    # an exact copy of the question's `tests` directory, if present
|   
+-- shared                   # any shared files specified with the "files" property
|   +-- testing_framework    # these can be directories, as well as individual files
|   |   `-- tester.c
|   `-- myscript.sh
|
`-- student                  # files that the student submitted
    `-- q_file.py            # files are names as specified by the client in the submission
```

You must specify an entrypoint script in the `entrypoint` property. This should be an absolute path to something that is executable via `chmod +x /path/to/entrypoint && /path/to/entrypoint`; this could take the form of a shell script, a python script, a compiled executable, or anything else that can be run like that. The absolute path can be determined by looking at the directory structure above. A common case would be to put an entrypoint in `externalGradingFilesCourse`, as above; in that case, you'd specify your entrypoint as `/grade/shared/myscript.sh`.

Once the driver script has extracted all your files to the correct locations, it will execute your entrypoint script. By the time your script returns, results should have been written into the file `/grade/results/results.json`; the format of that file is specified below. The contents of that file will be transmitted back to PrairieLearn to be saved and shown to the student.

## Directory layout

To utilize external grading, you'll need the following:

* `info.json` for each question must enable external grading

The following is an example of a well-structured course layout:

```
course
+-- questions           # all questions for the course
|   `-- addVector
|       +-- info.json           # required configuration goes here (see below)
|       |-- ...                 # some other question files
|       `-- tests               # folder of test cases
|           +-- ag.py           # testing files
|           `-- soln_out.txt
|
+-- externalGradingFilesCourse         # external grading files that will be shared between questions
|   +-- my_testing_framework           # related files can be grouped into directories
|   |   +-- file1
|   |   `-- file2
|   `-- my_library
|       `-- ...
```

## Enabling External Grading for a Question

The following fields must be added to each question's `info.json`:

```json
"externalGradingOptions": {
    "enabled": true,                                         // required
    "image": "prairielearn/centos7-base:dev",                // required
    "files": ["python_autograder/"],                         // optional
    "entrypoint": "/grade/shared/python_autograder/run.sh"   // optional
}
```

`image` should correspond to a docker image on a container repository, and will be passed directly to AWS Batch as the `image` field in a job definition. See [here](http://docs.aws.amazon.com/batch/latest/userguide/job_definition_parameters.html) for more information.

If `enabled` does not exist, external grading will be turned off by default. If a question is misbehaving while deployed, switching this to `false` will immediately prevent any future grading jobs from being submitted.

## Grading Result

Your grading scripts must write a grading result to `/grade/results/results.json`. The result only has 2 mandatory fields: `succeeded` and `score`. `succeeded` indicates if the tests were able to run successfully, or if they failed due to a compiler or other error. `score` is the score, and should be a floating point number in the range [0.0, 1.0].

If you are using code from the example question, you can also add additional fields to give more feedback to students; this additional information will be nicely rendered on the client to provide detailed feedback. Additional fields are optional, and they will be rendered if found. An example `results.json` showing both the two mandatory fields and the additional fields is shown below.

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
         "output": "Running test...\nYour output matched the expected output.",
      },
      {
         "name": "Test 2",
         "description": "Like Test 1, but harder, you'll probably fail it.",
         "points": 0,
         "max_points": 3,
         "message": "Make sure that your thing is doing the thing correctly.",
         "output": "Running test...\nYour output did not match the expected output."
      }
      ...
   ]
}
```

## Building a client for an externally-graded question

Your question client in `client.js` will have to submit user files in a specific format. Files are submitted using the usual `submittedAnswer` object. PrairieLearn expects all files to be stored in the `files` answer as an array of objects:

```json
"files": [
    {
        "name": "fib.py",
        "contents": "ZGVmIGZpYihuKToNCiAgaWYgKG4gPT0gMCk6DQogICAgICByZXR1cm4gMA0KICBlbGlmIChuID09IDEpOg0KICAgICAgcmV0dXJuIDENCiAgZWxzZToNCiAgICAgIHJldHVybiBmaWIobiAtIDEpICsgZmliKG4gLSAyKQ=="
    }, {
        "name": "anotherFile.py",
        "contents": "base64EncodedFileGoesHere"
    }
]
```

All files should be encoded as Base64 strings.

For a working example of this, see `PrairieLearn/exampleCourse/questions/fibonacciExternal/client.js`.

## Running locally for development

In production, PrairieLearn will utilize AWS services (S3 and Batch) to run external grading jobs. To make local development possible, PrairieLearn will replace AWS services with other solutions when running locally:

* Instead of using AWS Batch to execute jobs, they will be run locally and directly with Docker on the host machine.
* Instead of sending jobs to the grading containers with S3, we write them to a directory on the host machine and then mount that directory directly into the grading container as `/grade`. Note that this requires the main script of the grading image to know that it should not attempt to push to or pull from S3; when PrairieLearn starts your container, it will set the environment variable `DEV_MODE=1` to signify this. This will only be relevant if you're not using one of PrairieLearn's existing base images.
* Instead of receiving a webhook callback when results are available, PrairieLearn will simply wait for the grading container to die, and then attempt to read `results.json` from the root of the folder that was mounted in as `/grade`.

PrairieLearn supports two ways of running: natively, and inside a Docker container. We support running external autograders for each way. If the `HOST_JOBS_DIR` environment variable is set (more on that later), PrairieLearn will assume it's running in a conatiner; otherwise, it assumes it's running natively.

#### Running locally (on Docker)

We have to do a couple interesting things to run external grading jobs when PrairieLearn is running locally inside Docker:

* We need a way of starting up Docker containers on the host machine from within another Docker container. We achieve this by mounting the Docker socket from the host into the Docker container running PrairieLearn; this allows us to run 'sibling' containers.
* We need to get job files from inside the Docker container running PrairieLearn to the host machine so that Docker can mount them to `/grade` on the grading machine. We achieve this by mounting a directory on the host machine to `/jobs` on the grading machine, and setting an environment variable `HOST_JOBS_DIR` containing the absolute path of that directory on the host machine.

So, the command to run PrairieLearn locally will now look something like this:

```
docker run --rm -p 3000:3000 -v /path/to/PrairieLearn:/PrairieLearn -v /home/nathan/pl_ag_jobs:/jobs -e HOST_JOBS_DIR=/home/nathan/pl_ag_jobs -v /var/run/docker.sock:/var/run/docker.sock prairielearn/prairielearn
```

#### Running locally (native, not on Docker)

When not running in Docker, things are easier. The Docker socket can be used normally, and we're able to store job files automatically. By default, they are stored in `$HOME/pl_ag_jobs` on Unix-based systems and `$USERPROFILE/pl_ag_jobs` on Windows. However, if you run PrairieLearn with a an environment variable `JOBS_DIR=/abs/path/to/my/custom/directory/`, that directory will be used instead. Note that this environment variable has no effect when running on Docker.

TODO: document how this works on Windows.
