#!/bin/bash

mkdir -p exports

getexport () {
    COURSE=$1
    OUTFILE=exports/$1_`date "+%Y-%m-%dT%H:%M:%S"`.csv
    URL="https://prairielearn.engr.illinois.edu:/backend/$COURSE/export.csv"
    HEADERS=`node print_signature.js --headers mwest@illinois.edu "Matthew West" ~/git/ansible-pl/config-$COURSE-backend.json`
    CMD="curl -o $OUTFILE $HEADERS $URL"
    echo $COURSE
    eval "$CMD"
}

getexport tam212fa2015
getexport tam251fa2015
getexport tam210fa2015
