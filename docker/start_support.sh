#!/bin/bash

cd /PrairieLearn
docker/start_s3rver.sh
docker/start_postgres.sh
docker/start_redis.sh
docker/gen_ssl.sh
