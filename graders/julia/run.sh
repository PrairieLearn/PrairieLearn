#! /bin/bash

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
mkdir $OUT_DIR

mv $STUDENT_DIR/* $MERGE_DIR
mv $TEST_DIR/* $MERGE_DIR

# Do not allow ag user to modify, rename, or delete any existing files
chmod -R 755 "$MERGE_DIR"
chmod 1777 "$MERGE_DIR"

# Create directory without sticky bit for deletable files
export FILENAMES_DIR=$MERGE_DIR'/filenames'
mkdir $FILENAMES_DIR
chmod 777 $FILENAMES_DIR
mv $MERGE_DIR/ans.jl $MERGE_DIR/test.jl $JOB_DIR/data/data.json $FILENAMES_DIR

##########################
# RUN
##########################

echo "[run] starting autograder"

# randomly generate the name of the results file, so that someone can't guess and write to it
# write it to a file that is then deleted, so that it can't get picked up by the student
SECRET_NAME=$MERGE_DIR/`uuidgen`
echo -n "$SECRET_NAME" > $FILENAMES_DIR/output-fname.txt
chmod +r $FILENAMES_DIR/output-fname.txt

# run the autograder as a limited user called ag
export JULIA_DEPOT_PATH="/home/ag/.julia"
su -c "julia --project=/ $MERGE_DIR/filenames/test.jl" ag

# remove any "fake" results.json files if they exist
rm -f $MERGE_DIR/results.json
rm -f $OUT_DIR/results.json

# copy the results file from secret if it exists
if [ -f "$SECRET_NAME" ]; then
  mv "$SECRET_NAME" $OUT_DIR/results.json
fi

# if that didn't work, then print a last-ditch message
if [ ! -s $OUT_DIR/results.json ]
then
  echo '{"succeeded": false, "gradable":false, "score": 0.0, "message": "Your code could not be processed by the autograder. Please contact course staff and have them check the logs for this submission."}' > $OUT_DIR/results.json
fi

echo "[run] autograder completed"
