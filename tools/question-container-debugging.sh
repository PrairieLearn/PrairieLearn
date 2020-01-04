#! /bin/bash
#
# Assumes you run this script from your course content directory
# i.e.
#   $ ls
#   courseInstances/ infoCourse.json questions/ serverFilesCourse/
#   $ ~/git/PrairieLearn/tools/question-container-debugging.sh <QID> [<command to run in container>]
#
#   where <QID> is the folder name of the question you want to test
#   and the last argument is left out to auto-run it, or /bin/bash to explore
#   the grading container
#
# Environment variables:
#   STUDENTMOUNT="-v /tmp/foo:/grade/student"
#   PLMOUNT="-v /home/mussulma/git/PrairieLearn:/PrairieLearn"

QID=$1
if [ -z "$QID" ]; then
    echo "First argument must be QID (name of question directory)"
    exit 1
fi

if [ ! -d "./questions/$QID" ]; then
    echo "Directory questions/$QID not found, quitting"
    exit 1
fi

PLMOUNT=""
if [ -z "$PLPATH" ]; then
    echo ""
    echo "Environment variable PLPATH not set."
    echo "Set this to the absolute path to your PrairieLearn directory to use it inside the container"
    echo "Things will likely error without this."
    echo ""
else
    PLMOUNT="-v $PLPATH:/PrairieLearn"
fi

STUDENTMOUNT=""
if [ -z "$STUDENTPATH" ]; then
    echo ""
    echo "Environment variable STUDENTPATH not set."
    echo "Set this to the absolute path to folder on your system to be mounted to /grade/student"
    echo "That's where you fake the student submission"
    echo "Without that path, we'll use an empty folder in the container and the autorun likely won't work"
    echo ""
else
    STUDENTMOUNT="-v $STUDENTPATH:/grade/student"
fi

RUN="/PrairieLearn/tools/run-question-in-container.sh"
if [ -z "$2" ]; then
    DOCKERENV="-e QID=$QID -e RUNENTRY=1"
    IT=""
else
    IT="-it"
    DOCKERENV=""

    echo ""
    echo "The next helper script we would run is $RUN $QID run"
    echo "but we're running $2"
    echo ""
    RUN=$2
fi

IMAGE=$( cat ./questions/$QID/info.json | python3 -c \
    "import sys, json; print(json.load(sys.stdin)['externalGradingOptions']['image'])" )

DOCKEREXEC=$(cat <<-END
docker run $IT --rm
    -v $PWD:/course
    -v $PWD/serverFilesCourse:/grade/serverFilesCourse
    -v $PWD/questions/$QID/tests:/grade/tests
    $STUDENTMOUNT $PLMOUNT $DOCKERENV $IMAGE $RUN
END
)

echo_and_eval() {
    echo $@
    eval $@
}

echo_and_eval $DOCKEREXEC
