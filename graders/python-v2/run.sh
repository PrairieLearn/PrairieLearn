#! /bin/sh

##########################
# INIT
##########################

if [[ ! -d /grade ]]; then
    echo "ERROR: /grade not found! Mounting may have failed."
    exit 1
fi

# the parent directory containing everything about this grading job
export JOB_DIR='/grade'
# the job subdirectories
STUDENT_DIR=$JOB_DIR'/student'
TEST_DIR=$JOB_DIR'/tests'
OUT_DIR=$JOB_DIR'/results'

# where we will copy everything
export MERGE_DIR=$JOB_DIR'/run'

# now set up the stuff so that our run.sh can work
mkdir $MERGE_DIR
mkdir $MERGE_DIR/test_student
mkdir $OUT_DIR

mv $STUDENT_DIR/* $MERGE_DIR/test_student/
# TODO this has some pretty hardcoded assumptions about file names. Discuss in meeting
# what the best way to change this is
mv $TEST_DIR/* $MERGE_DIR/test_student/
mv $MERGE_DIR/test_student/test_student.py $MERGE_DIR/test_student.py

# Do not allow ag user to modify, rename, or delete any existing files
#chmod -R 755 "$MERGE_DIR"
#chmod 1777 "$MERGE_DIR"

##########################
# RUN
##########################

echo "[run] starting autograder"

# run the autograder as a limited user called ag
# TODO pass in the ag user id as a CLI option
#su -c "python3 $MERGE_DIR/pl_main.py" ag
uv run pytest -p pl-grader --color=no "$MERGE_DIR"

# TODO change the default output name
mv "$MERGE_DIR/autograder_results.json" "$OUT_DIR/results.json"

# if that didn't work, then print a last-ditch message
if [ ! -s $OUT_DIR/results.json ]; then
    echo '{"succeeded": false, "score": 0.0, "message": "Your code could not be processed by the autograder. Please contact course staff and have them check the logs for this submission."}' > $OUT_DIR/results.json
fi

echo "[run] autograder completed"
