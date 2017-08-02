#!/bin/bash

COURSE_DIR=""
# The line above is the location of your course directory.
# If this is blank then only the build-in exampleCourse will be used.
# Example:
# COURSE_DIR="/Users/mwest/GitHub/pl-tam212"

################################################
### SPECIAL OPTIONS                          ###
### You do not normally need to change these ###
################################################

JOBS_DIR=""
# The line above is the location of the directory used to store external
# grading jobs. Set this to enable external autograders in PrairieLearn.
# This directory will be created if it doesn't already exit.
# Example:
# JOBS_DIR="/Users/mwest/pl_jobs"

PL_DIR=""
# The line above is the location of the PrairieLearn source code.
# Only set this if you want to edit the code or use a non-standard version.
# Example:
# PL_DIR="/Users/mwest/GitHub/PrairieLearn"

PL_PORT=3000
# The line above is the port number to use for PrairieLearn. If this is 3000
# (the default) then PrairieLearn is accessesd at http://localhost:3000
# Note that PrairieLearn will always print a message saying to go to
# http://localhost:3000 even if you change this setting. You should ignore
# the message printed by PrairieLearn and use the port number set above.
# Example:
# PL_PORT=3000

##############################################################################
##############################################################################
# Setup code follows. Do not edit this.
COURSE_ARG=""
if [ ! -z "${COURSE_DIR}" ]; then
    COURSE_ARG="-v '${COURSE_DIR}:/course'"
fi
PL_ARG=""
if [ ! -z "${PL_DIR}" ]; then
    PL_ARG="-v '${PL_DIR}:/PrairieLearn'"
fi
JOBS_ARG=""
if [ ! -z "${JOBS_DIR}" ]; then
    mkdir -p "${JOBS_DIR}"
    JOBS_ARG="-v '${JOBS_DIR}:/jobs' -e 'HOST_JOBS_DIR=${JOBS_DIR}' -v /var/run/docker.sock:/var/run/docker.sock"
fi
##############################################################################
##############################################################################
# Command to run PrairieLearn
CALL="docker run -it --rm -p ${PL_PORT}:3000 ${COURSE_ARG} ${PL_ARG} ${JOBS_ARG} prairielearn/prairielearn"
echo ${CALL}
eval ${CALL}
