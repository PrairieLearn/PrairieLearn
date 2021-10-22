#! /bin/bash

STUDENT_FILES=$(find /grade/student -iname '*.java')
TEST_FILES=$(find /grade/tests/junit -iname '*.java')
RESULTS_FILE="/grade/results/results.json"

# -Xlint and -Xlint:-serial are used before the current JDK options,
# since they can be overwritten by the instructor. -Xlint:-path and -d
# are passed after them, since they are needed for the functionality
# of the autograder
export JDK_JAVAC_OPTIONS="-Xlint -Xlint:-serial $JDK_JAVAC_OPTIONS -Xlint:-path -d /grade/classpath"

exception() {
    jq -n --arg msg "$1" '{gradable: false, message: $msg}' > $RESULTS_FILE
    exit 0
}

mkdir -p /grade/results
mkdir -p /grade/classpath

cp -r /javagrader/*.class /javagrader/org /javagrader/libs/* /grade/classpath
cp -r /grade/tests/libs/*                                    /grade/classpath 2> /dev/null
cp -r /grade/serverFilesCourse/java/libs/*                   /grade/classpath 2> /dev/null

export CLASSPATH="/grade/classpath:$(ls /grade/classpath/*.jar -1 | tr '\n' ':')"

STUDENT_COMPILE_OUT=$(javac $STUDENT_FILES 2>&1)
if [ "$?" -ne 0 ] ; then
    echo "Compilation error"
    exception "Compilation errors, please fix and try again.

$STUDENT_COMPILE_OUT"
fi

TEST_COMPILE_OUT=$(javac $TEST_FILES 2>&1)
if [ "$?" -ne 0 ] ; then
    echo "$TEST_COMPILE_OUT"
    exception "Error compiling test files. This typically means your class does not match the specified signature."
fi

RESULTS_TEMP_DIR=$(mktemp -d -p /grade/results)
RESULTS_TEMP_FILE="$RESULTS_TEMP_DIR/$RANDOM.json"

chmod 700 /javagrader
chmod 711 /grade
chmod 700 /grade/*
chmod 711 /grade/results
chmod -R a+rX /grade/classpath
chmod 777 $RESULTS_TEMP_DIR

su - sbuser <<EOF
java -cp "$CLASSPATH" JUnitAutograder "$RESULTS_TEMP_FILE" "$TEST_FILES" "$STUDENT_COMPILE_OUT"
EOF

if [ -f $RESULTS_TEMP_FILE ] ; then
    mv $RESULTS_TEMP_FILE $RESULTS_FILE
else
    exception "No grading results could be retrieved. This usually means your program crashed before results could be saved."
fi
