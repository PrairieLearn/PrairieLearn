#!/bin/bash

echo 'Starting PrairieLearn...'
make -s -C /PrairieLearn start-workspace-host
make -s -C /PrairieLearn start
