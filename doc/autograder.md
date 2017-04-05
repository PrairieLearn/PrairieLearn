# Autograder Configuration

This guide assumes that PrairieLearn is running locally. AWS is not supported yet.

## The Autograding Process

PrairieLearn autograding is set up to enable courses to use their existing grading infrastructure. All autograding jobs will be run in self-contained Docker containers (basically a lightweight VM) that they will be able to configure to their course's specifications.

Autograding configuration is split into three components: environments, autograders, and tests. All of these are specified via files to go along with the PrairieLearn pattern of configuration by files and directories named by convention.

An environment specifies the environment in which your autograder is run, and is specified with a [Dockerfile](https://docs.docker.com/engine/reference/builder/). That Dockerfile can specify additional dependencies, compilers, etc. that your autograder may require to run. We will use that Dockerfile to build a Docker image, which we will then use to execute your test cases.

An autograder is a set of files that can be included in a question's test. If you have an autograder suite (for instance, CS 225's Monad) that relies on a large number of unchanging files, you can specify those in an autograder to avoid having to duplicate them in each autograded question.

Each autograded question should contain a directory called `tests` that contains any files that are specific to that test. If you specify any autograder for a question, you don't need to duplicate those files in your `tests` directory.

When we recieve a new question to autograde, will will set up a temporary directory. That directory will then have two subdirectories, `shared` and `student`. We will first copy your autograder files (if one is specified) into `shared`. We will then copy files in `tests` to `shared` as well, overwriting files if needed. Any code that the student submits will be copied into `student`. When we launch a container for your grading job, this directory will be mounted as `/grade`.

Your Dockerfile should specify a command that will be run to run your tests; typically, this will be a shell script that will copy files, set up users, do any additional configuration, and finally run your test suite. For instance, in the example course, the `python-main` environment has the script `init.sh`. As part of the build process, it copies that file into the root of the image and then specifies the command `CMD /init.sh`; that script then runs another script that is specifies in the python autograder.

Your autograder is responsible for writing the results of your tests into the file `/grade/results.json`; the format of that file is specified below. This format is standardized to allow for the reuse of this system between courses with different autograders.The contents of that file will be transmitted back to PrairieLearn to be saved and shown to the student.

## Directory layout

To use the autograder, the directory structure must be changed.

1. `tests` for each question
2. `autograders` that the course will use
3. `environment` folder that contains `DockerFiles` to setup the environment
4. `info.json` for each question much enable autograding

The following is an example of a well-structured course layout:

```
course
+-- questions           # all questions for the course (see other doc)
|   +-- addVector
|       `-- info.json           # autograding configuration goes here (see below)
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
`-- environments        # files needed to configure the autograder environment
    +-- env1            # each environment will be identified by its directory name
    |   `-- Dockerfile
    |   `--.dockerignore
    |   `--init.sh          # Your Dockerfile should execute this file at the end to run your autograder
    +-- env2
```

## Enable Autograding per Question

The following fields must be added to each question's `info.json`:

```json
"autrogradingEnabled": true,
"environment": "prairielearn/centos7-base"
```

`environment` should correspond to a docker image on a container repository, and will be passed directly to AWS Batch as the `image` field in a job definition. See [here](http://docs.aws.amazon.com/batch/latest/userguide/job_definition_parameters.html) for more information. In the future, PrairieLearn will be able to automatically build and deploy the environments in your `environments/` directory; when that feature is added, we'll first check if your `environment` value corresponds to a directory in `environments/`. If it does, we'll build an image from that environment and use it to run your grading job; if not, we'll treat the value as a reference to an image on a container repository.

Additionally, you can specify an autograder with `"autograder": "ag1"`. If you specify an autograder `placeholder`, the files from `[course]/autograders/placeholder` will be present in `/grade/shared/` when your job is run.

If `autogradingEnabled` does not exist, autograding will be turned off by default.

## Grading Result

Your autograder must write a grading result to `/grade/results/results.json`. The result only has 2 mandatory fields: `testingCompleted` and `score`. `testingCompleted` indicates if the tests were able to run successfully, or if they failed due to a compiler or other error. `score` is the score, and should be a floating point number in the range [0.0, 1.0].

If you are using the example question, you can also add additional fields to give more feedback to students; this additional information will be nicely rendered on the client to provide detailed feedback. Additional fields are optional, and they will be rendered if found. An example `results.json` showing both the two mandatory fields and the additional fields is shown below.

```json
{
   "testingCompleted": true,
   "score": 0.25,
   "message": "Tests completed successfully.",
   "output": "Running tests...\nTest 1 passed\nTest 2 failed!\n...",
   "tests": [
      {
         "name": "Test 1",
         "description": "Tests that a thing does a thing.",
         "points": 1,
         "maxPoints": 1,
         "message": "No errors!",
         "output": "Running test...\nYour output matched the expected output.",
      },
      {
         "name": "Test 2",
         "description": "Like Test 1, but harder, you'll probably fail it.",
         "points": 0,
         "maxPoints": 3,
         "message": "Make sure that the thing is doing the thing correctly.",
         "output": "Running test...\nYour output did not match the expected output."
      }
      ...
   ]
}
```

## Running locally for development

Autograding is handled by a service separate from PrairieLearn. In production, that service will be running on an EC2 instance, and potentially replicated across multiple EC2 instances. To make local development possible, PrairieLearn will replace AWS services with other solutions when running locally:

* Instead of using AWS Batch to execute jobs, they will be run locally and directly with Docker. We achieve this by mounting the Docker socket from the host into the Docker container running PrairieLearn; this allows us to run 'sibling' containers
* Instead of S3 storage, job files will be stored in `/jobs` on the host machine. This directory should exist before running PrairieLearn or the autograder.

So, the command to run PrairieLearn locally will now look something like this:

```
docker run --rm -p 3000:3000 -p -v /path/to/PrairieLearn:/PrairieLearn -v /jobs:/jobs -v /var/run/docker.sock:/var/run/docker.sock prairielearn/prairielearn
```

TODO: document how this works on Windows.
