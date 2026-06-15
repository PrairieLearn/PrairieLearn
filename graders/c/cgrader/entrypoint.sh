#! /usr/bin/env bash

# This script is the entrypoint for the grader. It assumes most users will
# include a /grade/tests/test.py file as a starting point, and will invoke that
# file if it exists.

if [[ -r /grade/tests/test.py ]]; then
    exec python3 /grade/tests/test.py
fi

# If we cannot identify the starting script, we will return an error.
mkdir -p /grade/results
echo '{"gradable": false, "message": "Error: Grader set up without an entrypoint and no default grading script."}' > /grade/results/results.json
