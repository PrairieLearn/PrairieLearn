# External Grading

PrairieLearn allows you to securely run custom grading scripts in environments that you specify. The main use case for this is to support the automatic grading of submitted code, but it's flexible enough to support a variety of use cases.

## High-level Overview

You can define a number of things for the external grading process:
* Custom environments (in the form of Docker images)
* Autograder code that is shared between questions
* Tests for individual questions

When a student clicks "Submit" on an externally-graded question, PrairieLearn will assemble all of those resources that you've defined into an archive. That archive will be submitted to be run as a job on AWS infrasctructure inside the environment that you specify. Results are then sent back to PrairieLearn; once they are processed, the student can refresh the page to see their score, individual test cases, `stdout`/`stderr`, and more.

## The Grading Process

PrairieLearn external grading is set up to enable courses to use their existing grading infrastructure. All external grading jobs will be run in self-contained Docker containers (basically a lightweight VM) that they will be able to configure to their course's specifications.

External grading configuration is split into three components: environments, autograders, and tests. All of these are specified via files to follow the PrairieLearn pattern of configuration via directories and files named by convention.

~~An environment specifies the environment in which your grading job is run, and is specified with a [Dockerfile](https://docs.docker.com/engine/reference/builder/). That Dockerfile can specify additional dependencies, compilers, etc. that your grading job may require to run. We will use that Dockerfile to build a Docker image, which we will then use to execute your test cases.~~

In the future PrairieLearn will be able to automatically build your environments into Docker images. For now, however, you'll have to build the images yourself. You can specify the image to be used via the `autograderImage` property in a question's `info.json`. Note that this image should be hosted on a service like Dockerhub so that AWS Batch will be able to pull down the image when running your job. See **Enabling External Grading for a Question** below for more details on this.

An autograder is a set of files that can be included in a question's test. If you have an autograder suite (for instance, CS 225's Monad) that relies on a large number of unchanging files, you can specify those in an autograder to avoid having to duplicate them in each externally graded question. An autograder could also contain precompiled executables, or any resources that could be shared between many questions.

Each externally graded question should contain a directory called `tests` that contains any files that are specific to that test. If you specify an autograder for a question, you don't need to duplicate those files in your `tests` directory.

When we recieve a new submission for an externally graded question, we will set up a temporary directory. That directory will then contain three subdirectories: `shared`, `tests`, and `student`. We will then do the following to populate that directory:
* We will copy the contents of the directory corresponding to the `environment` you specified into the root of this temporary directory. **Note:** When PrairieLearn supports automatically building images in the future, this will change.
* If an autograder is specified, we will copy the contents of the directory corresponding to said `autograder` into `shared`.
* We will copy files in your question's `tests` directory to `tests` in the temporary directory.
* Any code that the student submits will be placed into `student`.
When we launch a container for your grading job, a copy of this temporary directory will be mounted as `/grade`.

~~Your Dockerfile should specify a command that will be run to run your tests; typically, this will be a shell script that will copy files, set up users, do any additional configuration, and finally run your test suite. For instance, in the example course, the `python-main` environment has the script `init.sh`. As part of the build process, it copies that file into the root of the image and then specifies the command `CMD /init.sh`; that script then runs another script that is specified in the python autograder.~~

Your Docker image should use one of our base images (see `PrairieLearn/environments`) in its `FROM` directive. This is crucial, as our base image contains a Python script that will load the job files from S3, unzip them, run your specified scripts, upload the results back to S3, and notify PrairieLearn that the results are available. If you really don't wish to extend from our image, you'll have to duplicate the actions of our script in your own image. The following base images are available on Dockerhub:
* `prairielearn/centos7-base`

Once our script has downloaded and unzipped the files from your job, it will do the following:
* Run the first of the following scripts that it finds: `/grade/tests/init.sh`, `/grade/shared/init.sh`, `/grade/init.sh`. These correspond to scripts from `tests`, `autograder`, and `environment`, respectively. These scripts can do things like copy files into their correct locations, set up users, and do additional configuration. Crucially, your init script should ensure that `/grade/run.sh` exists.
* Run `/grade/run.sh`; this script should run your grading process.

Your grading scripts are responsible for writing the results of your tests into the file `/grade/results/results.json`; the format of that file is specified below. The contents of that file will be transmitted back to PrairieLearn to be saved and shown to the student.

## Directory layout

To utilize external grading, you'll need the following:

* `tests` for each question
* `autograders` that the course will use
* `environment` folder ~~that contains `DockerFiles` to setup the environment~~
* `info.json` for each question must enable external grading

The following is an example of a well-structured course layout:

```
course
+-- questions           # all questions for the course (see other doc)
|   +-- addVector
|       `-- info.json           # required configuration goes here (see below)
|       `-- ...                 # some other question files
|       +-- tests               # folder of test cases
|           `-- ag.py       
            `-- soln_out.txt    # testing files
|        
|   
+-- autograders         # all autograders for the course
|   +-- ag1             # each set of autograder will be identified by its directory name
|       `-- file1       # some autograder files
|       `-- file2
|   +-- ag2
|       `-- ...
|
`-- environments        # files needed to configure the grading environment
    +-- env1            # each environment will be identified by its directory name
    |   `-- Dockerfile
    |   `-- .dockerignore
    |   `-- init.sh          # This will be executed to perform initial setup when the grading job is started
    +-- env2
```

## Enabling External Graing for a Question

The following fields must be added to each question's `info.json`:

```json
"autrogradingEnabled": true,
"environment": "env1",
"autograderImage": "prairielearn/centos7-base"
```

`autograderImage` should correspond to a docker image on a container repository, and will be passed directly to AWS Batch as the `image` field in a job definition. See [here](http://docs.aws.amazon.com/batch/latest/userguide/job_definition_parameters.html) for more information. In the future, PrairieLearn will be able to automatically build and deploy images for the environments in your `environments/` directory, at which point `autograderImage` won't be necessary.

Additionally, you can specify an autograder with `"autograder": "ag1"`. If you specify an autograder `placeholder`, the files from `[course]/autograders/placeholder` will be present in `/grade/shared/` when your job is run.

If `autogradingEnabled` does not exist, external grading will be turned off by default.

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
         "message": "Make sure that the thing is doing the thing correctly.",
         "output": "Running test...\nYour output did not match the expected output."
      }
      ...
   ]
}
```

## Building a client for an externally-graded question

Your question client in `client.js` will have to submit user files in a specific format. Files are submitted using the usual `submittedAnswer` object. PrairieLearn expects all files to be stored in the `_files` answer as an array of objects:

```json
[
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
