#! /bin/bash

##########################
# INIT
##########################

## switch to control if more values are displayed on console or not
DEBUG="off"
export DEBUG
if [ ${DEBUG} == "on" ]; then VFLAG="-v" else VFLAG=""; fi

## the directory where the file pertaining to the job are mounted
JOB_DIR="/grade"
## the other directories inside it
STUDENT_DIR="${JOB_DIR}/student"
AG_DIR="${JOB_DIR}/serverFilesCourse/r_autograder"
TEST_DIR="${JOB_DIR}/tests"
OUT_DIR="${JOB_DIR}/results"

## where we will copy everything
MERGE_DIR="${JOB_DIR}/run"
## where we will put the actual student code - this depends on what the autograder expects, etc
BIN_DIR="${MERGE_DIR}/bin"

## now set up the stuff so that our run.sh can work
echo "[run.sh] making directories"
mkdir ${MERGE_DIR} ${BIN_DIR} ${OUT_DIR}

## making the test directory root:root and stripping group and others
## this will prevent the restricted user from snooping
chown -R root:root ${TEST_DIR}
chmod -R go-rwx    ${TEST_DIR}

## under 'tinytest' artefacts are created where the tests are running
## so let the 'ag' user own the directory to write files, run mkdir, ...
echo "[run.sh] setting up tests directory for 'ag' user"
chown ag:ag ${TEST_DIR}
if [ ${DEBUG} == "on" ]; then ls -ld ${TEST_DIR}; fi

echo "[run.sh] copying content"
cp    ${VFLAG}  ${STUDENT_DIR}/*  ${BIN_DIR}
cp    ${VFLAG}  ${AG_DIR}/*       ${MERGE_DIR}
cp -r ${VFLAG}  ${TEST_DIR}/*     ${MERGE_DIR}
chown ${VFLAG}  ag:ag             ${MERGE_DIR}

if [ ${DEBUG} == "on" ]; then ls -ld ${MERGE_DIR} ${MERGE_DIR}/*; fi


##########################
# RUN
##########################

cd ${MERGE_DIR}

echo "[run.sh] starting autograder"

## we evaluate student code inside the test functions as a limited user called ag
## see the R package plr in the stat430dspm repo for details of the implementation
echo "[run.sh] Rscript pltest.R"
Rscript pltest.R

if [ ! -s results.json ]
then
    # Let's attempt to keep everything from dying completely
    echo '{"succeeded": false, "score": 0.0, "message": "Catastrophic failure! Contact course staff and have them check the logs for this submission."}' > results.json
fi

echo "[run.sh] autograder completed"

# get the results from the file
cp  ${VFLAG}  ${MERGE_DIR}/results.json  ${OUT_DIR}
echo "[run.sh] copied results and DONE."
echo "[run.sh] DONE"
