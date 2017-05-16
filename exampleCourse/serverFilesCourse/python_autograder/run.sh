#! /bin/bash

##########################
# INIT
##########################

# the directory where the job stuff is
JOB_DIR='/grade/'
# the other directories
STUDENT_DIR=$JOB_DIR'student/'
AG_DIR=$JOB_DIR'shared/python_autograder/'
TEST_DIR=$JOB_DIR'tests/'
OUT_DIR=$JOB_DIR'results/'

# where we will copy everything
MERGE_DIR=$JOB_DIR'run/'
# where we will put the actual student code- this depends on what the autograder expects, etc
BIN_DIR=$MERGE_DIR'bin/'

# now set up the stuff so that our run.sh can work
mkdir $MERGE_DIR
mkdir $BIN_DIR
mkdir $OUT_DIR

cp $STUDENT_DIR* $BIN_DIR
cp $AG_DIR* $MERGE_DIR
cp $TEST_DIR* $MERGE_DIR

# we need this to include code as python modules
# There is already one in the /run directory, but we need one in the /run/bin directory as well
echo "" > $BIN_DIR/__init__.py


##########################
# RUN
##########################

RESULTS_FILE='/grade/results/results.json'

cd $JOB_DIR'run/'

# give the ag user the ownership of it's small bin folder
sudo chown ag $BIN_DIR
sudo chmod -R +rw $BIN_DIR

echo "[run] starting autograder"

# we do the capturing ourselves, so that only the stdout of the autograder is used and that we aren't relying on any files that the student code could easily create
# we are also running the autograder as a limited user called ag
sudo -H -u ag bash -c 'python3.5 autograder_wrapper.py' > results.json

echo "[run] autograder completed"

# get the results from the file
cp $MERGE_DIR/results.json $RESULTS_FILE
echo "[run] copied results"
