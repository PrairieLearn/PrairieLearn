#!/bin/bash

# the directory where the job stuff is
JOB_DIR='/grade/'
# the other directories
STUDENT_DIR=$JOB_DIR'student/'
SHARED_DIR=$JOB_DIR'shared/'
TEST_DIR=$JOB_DIR'tests/'
OUT_DIR=$JOB_DIR'results/'
# where we will copy everything
MERGE_DIR=$JOB_DIR'run/'
# where we will put the actual student code- this depends on what the autograder expects, etc
BIN_DIR=$MERGE_DIR'bin/'

# for legacy reasons, before we start copy fib.py into q1.cpp
# ideally this would be something more generic, depending on autograder setup
mv $MERGE_DIR/'fib.py' $MERGE_DIR/'q1.cpp'

# run the autograder as non-root
# THIS IS IMPORTANT

# this file is in /grade/run/autograder.sh, and its working directory will be the root (or either way we can be safe and cd to use anyways)
cd /grade/run/

# copy in the .h, main.cpp, and Makefile into bin
cp $MERGE_DIR/'Makefile' $BIN_DIR/.
cp $MERGE_DIR/'q1.h' $BIN_DIR/.
cp $MERGE_DIR/'main.cpp' $BIN_DIR/.

# give the ag user the ownership of it's small bin folder
sudo chown ag bin

echo "[ag] chown"

sudo chmod -R +rw bin/

echo "[ag] chmod"

#cd bin

#echo "[ag] cded"

echo "[ag] compiling & running"

# it would be nice to do this in some sort of wrapper that could put the compilation output into the json
# we do the capturing ourselves, so that only the stdout of the autograder is used and that we aren't relying on any files that the student code could easily create
# we are also running the autograder as a limited user called ag

make -j && sudo -H -u ag bash -c './tester' > results.json

echo "[ag] done"
