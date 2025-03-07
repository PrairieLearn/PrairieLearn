#! /usr/bin/env bash

# This script is the entrypoint for the grader. It assumes most users will
# include a /grade/tests/test.py file as a starting point, and will invoke that
# file if it exists. 

if [[ -r /grade/tests/test.py ]]; then
    python3 /grade/tests/test.py
    exit $?
fi

# If /grade/tests/test.py does not exist, but there is a single .py file in the
# /grade/tests directory, run that file. 

single_py_file=$(find /grade/tests -maxdepth 1 -name '*.py' -type f -readable)
if [[ $(echo "$single_py_file" | wc -w) -eq 1 ]]; then
    python3 "$single_py_file"
else
    # If we cannot reliably identify the starting script, we will return an error.
    mkdir -p /grade/results
    echo '{"gradable": false, "message": "Error: Grader set up without an entrypoint and no default grading script."}' > /grade/results/results.json
fi
