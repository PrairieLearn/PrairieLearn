#!/bin/bash
# NOTE: ${0##*/} expands to the name of this script file
#

echo "[${0##*/}] started"

# Download the job files form S3
# Job number should be specified in the JOB_ID environment variable
if [[ -z "$JOB_ID" ]]; then
  echo "[${0##*/}] ERR: job id was not specified in JOB_ID environment variable"
  # We can't even generate and err json document because there's no job ID to
  # associate with the output
  exit
else
  echo "[${0##*/}] running job $JOB_ID"
fi

if [ -f /grade/init.sh ]; then
  sh /grade/init.sh
else
  echo "[${0##*/}] /grade/init.sh not specified; skipping"
fi

if [ -f /grade/run.sh ]; then
  sh /grade/run.sh
else
  echo "[${0##*/}] ERR: /grade/run.sh missing"
fi

echo "[${0##*/}] finishing"
