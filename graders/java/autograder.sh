#! /bin/bash

STUDENT_FILES=$(find /grade/student -iname '*.java')
TEST_FILES=$(find /grade/tests/junit -iname '*.java')
RESULTS_FILE="/grade/results/results.json"
JAVA_COMPILATION_FLAGS="-Xlint -Xlint:-path -d /grade/classpath"

exception() {
    jq -n --arg msg "$1" '{gradable: false, message: $msg}' > $RESULTS_FILE
    exit 0
}

mkdir -p /grade/results
mkdir -p /grade/classpath

cp -r /javagrader/*.class /javagrader/org /javagrader/libs/* /grade/classpath
cp -r /grade/tests/libs/*                                    /grade/classpath 2> /dev/null
cp -r /grade/serverFilesCourse/java/libs/*                   /grade/classpath 2> /dev/null

STUDENT_COMPILE_OUT=$(javac $JAVA_COMPILATION_FLAGS $STUDENT_FILES 2>&1)
if [ "$?" -ne 0 ] ; then
    echo "Compilation error"
    exception "Compilation errors, please fix and try again.

$STUDENT_COMPILE_OUT"
fi

TEST_COMPILE_OUT=$(javac $JAVA_COMPILATION_FLAGS $TEST_FILES 2>&1)
if [ "$?" -ne 0 ] ; then
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
java -cp "/grade/classpath:/grade/classpath/*" JUnitAutograder "$RESULTS_TEMP_FILE" "$TEST_FILES" "$STUDENT_COMPILE_OUT"
EOF

if [ -f $RESULTS_TEMP_FILE ] ; then
    mv $RESULTS_TEMP_FILE $RESULTS_FILE
else
    exception "No grading results could be retrieved. This usually means your program crashed before results could be saved."
fi
