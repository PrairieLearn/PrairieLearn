#!/bin/bash

# This script assembles our quickstart scripts into tar archives
# This should be rerun whenever any of the scripts change

# Set executable bit; this will persist in the archive
chmod +x prairielearn.sh
tar -czvf prairielearn.tar.gz prairielearn.sh
