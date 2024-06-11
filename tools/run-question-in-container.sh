#! /bin/bash
#
# Setup the grading environment inside an externally graded question container
#
# Usage:
#   run-question-in-container [<QID>] [run]
#       QID is the question folder (i.e. fibonacciEditor)
#       QID can come from $QID environment variable or first argument
#       If second argument is present, the script will run the entrypoint script
#
# Assumes the course content directory is at /course
#
IN_CONTAINER=`grep docker /proc/1/cgroup`  # empty when not in a docker container

if [ -z "$IN_CONTAINER" ]; then
    echo "This tool is designed to run inside the grading container"
    exit 1
fi

if [ -z "$QID" ]; then
    QID=$1
    if [ -z "$QID" ]; then
        echo "First argument must be QID (name of question directory)"
        exit 1
    fi
fi
if [ ! -d "/course/questions/$QID" ]; then
    echo "Directory /course/questions/$QID not found, quitting"
    exit 1
fi

# Setup the environment
mkdir -p /grade
mkdir -p /grade/student
rm -rf /grade/run
rm -rf /grade/results

# This script assumes /grade/serverFilesCourse and /grade/student are
# mounted into the docker container so they are not copied at this stage
# This is different than production to facilitate development editing.
#cp -R /course/questions/$QID/tests /grade
#cp -R /course/serverFilesCourse /grade

ENTRYPOINT=`cat /course/questions/$QID/info.json | python3 -c \
    "import sys, json; print(json.load(sys.stdin)['externalGradingOptions']['entrypoint'])"`

if [ -z "$2" ] && [ -z "$RUNENTRY" ]; then
    echo ""
    echo "/grade environment ready!"
    echo "Make sure an appropriate submission is in /grade/student"
    echo "Then run this again with the 'run' argument at the end"
    echo "Or run your entrypoint manually at $ENTRYPOINT"
    echo ""
    exit 0
fi

chmod +x $ENTRYPOINT
$ENTRYPOINT

echo ""
cat /grade/results/results.json | python3 -c \
    "import sys, json; parsed=json.load(sys.stdin); print(json.dumps(parsed, indent=4, sort_keys=True))"
