#!/bin/bash

cd /PrairieLearn
docker/start_postgres.sh
npm test
