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
mkdir -p /grade/params

cp -r /javagrader/*.class /javagrader/org /javagrader/libs/* /grade/classpath
cp -r /grade/tests/libs/* /grade/classpath 2> /dev/null
cp -r /grade/serverFilesCourse/java/libs/* /grade/classpath 2> /dev/null

CLASSPATH="/grade/classpath:$(ls /grade/classpath/*.jar -1 | tr '\n' ':')"
export CLASSPATH

STUDENT_COMPILE_OUT=$(javac $STUDENT_FILES 2>&1)
if [ "$?" -ne 0 ]; then
    echo "Compilation error"
    exception "Compilation errors, please fix and try again.

$STUDENT_COMPILE_OUT"
fi

TEST_COMPILE_OUT=$(javac $TEST_FILES 2>&1)
if [ "$?" -ne 0 ]; then
    echo "$TEST_COMPILE_OUT"
    exception "Error compiling test files. This typically means your class does not match the signature of the test classes.
Make sure all classes, properties, methods, and other elements in your class match the specified signature.
In particular, ensure method parameters, thrown exceptions, visibility modifiers, property types, and other definitions are correct."
fi

if [ -d /grade/tests/studentFiles ]; then
    cp -r /grade/tests/studentFiles/. /home/sbuser 2> /dev/null
    chown -R sbuser:sbuser /home/sbuser 2> /dev/null
    chmod -R a+rX /home/sbuser 2> /dev/null
fi

RESULTS_TEMP_DIR=$(mktemp -d -p /grade/results)
RESULTS_TEMP_FILE="$RESULTS_TEMP_DIR/$RANDOM.json"
SIGNATURE=$(head -c 32 /dev/random | base64)

jq -n --arg results_file "$RESULTS_TEMP_FILE" \
    --arg compile_output "$STUDENT_COMPILE_OUT" \
    --arg test_files "$TEST_FILES" \
    --arg signature "$SIGNATURE" \
    '{results_file: $results_file, compile_output: $compile_output, test_files: $test_files, signature: $signature}' > /grade/params/params.json

chmod 700 /javagrader
chmod 711 /grade
chmod 700 /grade/*
chmod 711 /grade/results
chmod -R a+rX /grade/classpath
chmod 777 $RESULTS_TEMP_DIR
chmod 777 /grade/params
chmod 777 /grade/params/params.json

# Disable Java management options to hinder student's ability to dump
# the heap.
DISABLE_JAVA_MANAGEMENT="-XX:+DisableAttachMechanism -Djavax.management.builder.initial=DISABLED"

su - sbuser << EOF
java $JDK_JAVA_OPTIONS -cp "$CLASSPATH" $DISABLE_JAVA_MANAGEMENT JUnitAutograder
EOF

if [ -f $RESULTS_TEMP_FILE ]; then
    RESULT_SIGNATURE=$(jq -r '.signature' $RESULTS_TEMP_FILE)
    if [ "$RESULT_SIGNATURE" != "$SIGNATURE" ]; then
        echo Expected signature: $SIGNATURE
        echo Provided signature: $RESULT_SIGNATURE
        exception "Results did not contain correct signature. Please contact the instructor."
    else
        mv $RESULTS_TEMP_FILE $RESULTS_FILE
    fi
else
    exception "No grading results could be retrieved.
This usually means your program crashed before results could be saved.
The most common cause is a call to System.exit(),
though this may be a result of stack overflow, excessive memory allocation, or similar problems."
fi
