# Python Directory

This directory contains all the shared python code. Elements can import from this directory to use shared code. You should not import from `test` or from `prairielearn.internal`, as they are not guaranteed to have a stable API.

All element code is run in the context of zygote.py, so it will be run from this directory.
