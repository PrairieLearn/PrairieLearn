#!/bin/bash

cd /PrairieLearn
docker/start_postgres.sh
if [[ -n $NODEMON ]] && [[ $NODEMON == "true" ]]; then
  npm run start-nodemon
else
  npm start
fi
