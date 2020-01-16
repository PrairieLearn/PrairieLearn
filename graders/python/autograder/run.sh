#! /bin/bash

##########################
# INIT
##########################

# the directory where the job stuff is
JOB_DIR='/grade/'
# the other directories
STUDENT_DIR=$JOB_DIR'student/'
AG_DIR='/python_autograder/'
TEST_DIR=$JOB_DIR'tests/'
OUT_DIR=$JOB_DIR'results/'

# where we will copy everything
MERGE_DIR=$JOB_DIR'run/'
# where we will put the actual student code- this depends on what the autograder expects, etc

# now set up the stuff so that our run.sh can work
mkdir $MERGE_DIR
mkdir $OUT_DIR

mv $STUDENT_DIR* $MERGE_DIR
mv $AG_DIR* $MERGE_DIR
mv $TEST_DIR* $MERGE_DIR

# user does not need a copy of this script
rm -f "$MERGE_DIR/run.sh"
rm -rf "$JOB_DIR/shared"

# we need this to include code as python modules
echo "" > $MERGE_DIR/__init__.py

# Do not allow ag user to modify, rename, or delete any existing files
chmod -R 755 "$MERGE_DIR"
chmod 1777 "$MERGE_DIR"

cd $MERGE_DIR

# Create directory without sticky bit for deletable files
mkdir filenames
chmod 777 filenames
mv ans.py setup_code.py test.py filenames

##########################
# RUN
##########################

echo "[run] starting autograder"

# write name of the secret file to a file
SECRET_NAME=`uuidgen`
echo -n "$SECRET_NAME" > filenames/output-fname.txt
chmod +r filenames/output-fname.txt

# we run the autograder as a limited user called ag
su -c 'python3 pltest.py' ag

rm -f results.json
rm -f "$OUT_DIR/results.json"
if [ -f "$SECRET_NAME" ]; then
  mv "$SECRET_NAME" results.json
fi
if [ ! -s results.json ]
then
  # Let's attempt to keep everything from dying completely
  echo '{"succeeded": false, "score": 0.0, "message": "The autograder has failed. Please contact course staff and have them check the logs for this submission."}' > results.json
fi

echo "[run] autograder completed"

# get the results from the file
cp results.json "$OUT_DIR/results.json"
echo "[run] copied results"
