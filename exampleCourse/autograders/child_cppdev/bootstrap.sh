# this is the script that will run the provided scripts and take the output

# the directory where the class autograder is
AG_DIR='/autograder/'

# the name of the course script
AG_SCRIPT='autograder.sh'

# run the script
chmod +x $AG_DIR$AG_SCRIPT
cd $AG_DIR
./$AG_SCRIPT

# get the results from the file
cat /autograder_results/result.json
