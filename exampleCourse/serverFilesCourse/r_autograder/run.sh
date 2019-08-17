#! /bin/bash

##### SETUP #####
echo "[setup] Establishing directories..."

# Base directory
JOB_DIR='/grade/'

# Path is /grade/student
STUDENT_DIR=$JOB_DIR'student/'

# Path is /grade/serverFilesCourse/r_autograder
SERVER_FILES_COURSE_DIR=$JOB_DIR'serverFilesCourse/r_autograder/'

# Path is /grade/tests/
TEST_DIR=$JOB_DIR'tests/'

## Student files, test files, and serverFilesCourse files will be merged into
## this directory
# Path /grade/run
AG_DIR=$JOB_DIR'run/'

## Results should end up in this directory
# Path /grade/results
RESULTS_DIR=$JOB_DIR'results/'

mkdir $AG_DIR
mkdir $RESULTS_DIR

# Copy tests and student code into the run directory
cp -av $TEST_DIR. $AG_DIR
cp -rv $STUDENT_DIR. $AG_DIR

# Copy the grader script and catch header into the run directory
cp -v -R $SERVER_FILES_COURSE_DIR* $AG_DIR

# Give the ag user ownership of the run folder
/usr/bin/sudo chown ag $AG_DIR
/usr/bin/sudo chmod -R +rw $AG_DIR

##### EXECUTION #####
echo "[run] Starting grading..."

cd $AG_DIR
echo $PWD

# Run the autograder as non-root
# !!! THIS IS IMPORTANT !!!
# We do the capturing ourselves, so that only the stdout of the autograder
# is used and that we aren't relying on any files that the student code could
# easily create. we are also running the autograder as a limited user called ag
/usr/bin/sudo -H -u ag bash -c 'Rscript pltest.R' > results.json

# Protect against the scenario when a catastrophic failure occurs.
if [ ! -s results.json ]
then
  # Let's attempt to keep everything from dying completely
  echo '{"succeeded": false, "score": 0.0, "message": "Catastrophic failure! Contact course staff and have them check the logs for this submission."}' > results.json
fi

echo "[run] Grading complete..."

##### RESULT RETURN #####

# Place the results file into the output directory
cp $AG_DIR'results.json' $RESULTS_DIR'results.json'

echo "[run] Exported results..."
