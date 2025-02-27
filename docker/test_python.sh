#!/bin/bash

make -s -C /PrairieLearn test-python
# Generate coverage.xml for codecov
cd /PrairieLearn && python3 -m coverage xml -o apps/prairielearn/python/coverage.xml
