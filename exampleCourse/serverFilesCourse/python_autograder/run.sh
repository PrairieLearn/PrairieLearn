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

# the name of the course script; in our case this is a shell script that will start our python autograder
AG_SCRIPT='autograder.sh'

RESULTS_FILE='/grade/results/results.json'

# run the script
echo "[run] starting up"
chmod +x $MERGE_DIR$AG_SCRIPT
echo "[run]: chmod"
cd $MERGE_DIR
echo "[run] cd"
./$AG_SCRIPT
echo "[run] run"

# get the results from the file
cp $MERGE_DIR/results.json $RESULTS_FILE
echo "[run] copied results"
