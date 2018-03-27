#!/bin/bash

cd /PrairieLearn
docker/start_postgres.sh
# Uncomment to start redis to test message passing
# redis-server --daemonize yes
if [[ -n $NODEMON ]] && [[ $NODEMON == "true" ]]; then
  npm run start-nodemon
else
  npm start
fi
