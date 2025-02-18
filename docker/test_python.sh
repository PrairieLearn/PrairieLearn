#!/bin/bash

make -s -C /PrairieLearn test-python
# Generate coverage.xml file
cd /PrairieLearn && python3 -m coverage xml
ls -la /PrairieLearn
