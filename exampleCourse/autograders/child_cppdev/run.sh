#! /bin/bash
# this is the script that will run the autograder and collect the outputs

# the directory where the stuff to run is
AG_DIR='/grade/run/'

# the name of the course script; in our case this is a shell script that will start our autograder
AG_SCRIPT='autograder.sh'

RESULTS_FILE='/grade/results/results.json'

# run the script
echo "[run] starting up"
chmod +x $AG_DIR$AG_SCRIPT
echo "[run]: chmod"
cd $AG_DIR
echo "[run] cd"
./$AG_SCRIPT
echo "[run] run"

# get the results from the file
cp $AG_DIR/results.json $RESULTS_FILE
echo "[run] copied results"
