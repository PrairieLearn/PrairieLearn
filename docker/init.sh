#!/bin/bash

cd /PrairieLearn
docker/start_postgres.sh
redis-server --daemonize yes
if [[ -n $NODEMON ]] && [[ $NODEMON == "true" ]]; then
  npm run start-nodemon
else
  npm start
fi
