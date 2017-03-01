#! /bin/bash
# this is the script that will run the provided scripts and take the output

# the directory where the class stuff is
AG_DIR='/grade/shared/'

# the name of the course script
AG_SCRIPT='autograder.sh'

# run the script
echo "[boot] starting up"
chmod +x $AG_DIR$AG_SCRIPT
echo "[boot]: chmod"
cd $AG_DIR
echo "[boot] cd]"
./$AG_SCRIPT
echo "[boot] run"

# get the results from the file
cat /grade/results.json
