# Python Directory

This directory contains all the shared python code. Elements can import from this directory to use shared code. You should not import from `test` or from `prairielearn.internal`, as they are not guaranteed to have a stable API.

Questions are executed with their working directory as the question. `zygote.py` (the runner for questions) adds its own working directory to Python's path, so any imports in this directory will be available to questions.

You can view [the documentation for the `prairielearn` module](https://docs.prairielearn.com/python-reference/) to view the available functions and classes available inside questions and elements.
