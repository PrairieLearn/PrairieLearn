#!/bin/bash

set -e

# Parse the first argument to this script, which will be a container name.
if [ "$#" -ne 1 ]; then
    echo "USAGE: $0 container_name" >& 2
    echo "Example: $0 test_container" >& 2
    exit 1
fi
CONTAINER_NAME=$1

# Construct a list of all coverage reports in the container.
docker container exec $CONTAINER_NAME bash -c "find /PrairieLearn/apps -name cobertura-coverage.xml" >> /tmp/coverage_reports.txt
docker container exec $CONTAINER_NAME bash -c "find /PrairieLearn/packages -name cobertura-coverage.xml" >> /tmp/coverage_reports.txt

# Print the list for debugging.
echo "Coverage reports in container:"
cat /tmp/coverage_reports.txt
echo ""

# Compute the absolute path of the root directory of the repository.
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" &> /dev/null && pwd )"
ROOT_DIR=$(realpath $SCRIPT_DIR/..)

# Copy each coverage report to the appropriate location on the host.
while read -r COVERAGE_REPORT; do
    RELATIVE_PATH=$(echo $COVERAGE_REPORT | sed 's/\/PrairieLearn\///')
    HOST_COVERAGE_REPORT=$ROOT_DIR/$RELATIVE_PATH
    echo "Copying $COVERAGE_REPORT to $HOST_COVERAGE_REPORT"
    mkdir -p $(dirname $HOST_COVERAGE_REPORT)
    docker container cp $CONTAINER_NAME:$COVERAGE_REPORT $HOST_COVERAGE_REPORT
done < /tmp/coverage_reports.txt
