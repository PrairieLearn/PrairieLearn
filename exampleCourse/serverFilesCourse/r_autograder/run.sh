#! /bin/bash

##### VARIABLE SETUP #####
echo "[setup] Establishing variables for directories..."

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

##### Directory setup #####
echo "[setup] Creating directories..."

mkdir $AG_DIR $RESULTS_DIR

##### File Copies #####
echo "[setup] Copying files to directories..."

# Copy tests and student code into the run directory
cp -av $TEST_DIR. $AG_DIR
cp -rv $STUDENT_DIR. $AG_DIR

# Copy the grader script and catch header into the run directory
cp -v -R $SERVER_FILES_COURSE_DIR* $AG_DIR

# Ensure correct root permissions over the run/ directory
# go-rwx: removes read, write, execute permissions
# from the group and other users, but not user who owns the file
/usr/bin/sudo chown -R root:root $AG_DIR
/usr/bin/sudo chmod -R go-rwx    $AG_DIR

# Give the ag user ownership of the run/ folder
# /usr/bin/sudo chown ag $AG_DIR
# /usr/bin/sudo chmod -R +rw $AG_DIR

##### EXECUTION #####
echo "[run] Starting grading..."

cd $AG_DIR
echo $PWD

# Run the autograder as root
# Student code is executed as ag
/usr/bin/sudo bash -c 'Rscript -e "pltest::run_testthat()"' > results.json

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
