#!/bin/bash
# NOTE: ${0##*/} expands to the name of this script file

echo "[${0##*/}] started"

# A lot of things need to be specified via environment variables
# Let's complain if any are missing
if [[ -z "$JOB_ID" ]]; then
  echo "[${0##*/}] ERR: job id was not specified in JOB_ID environment variable"
  # We can't even generate and err json document because there's no job ID to
  # associate with the output
  exit
fi

if [[ -z "$S3_JOBS_BUCKET" ]]; then
  echo "[${0##*/}] ERR: the S3 jobs bucket was not specified in S3_JOBS_BUCKET environment variable"
  exit 1
fi

if [[ -z "$S3_RESULTS_BUCKET" ]]; then
  echo "[${0##*/}] ERR: the S3 results bucket was not specified in S3_RESULTS_BUCKET environment variable"
  exit 1
fi

if [[ -z "$S3_ARCHIVES_BUCKET" ]]; then
  echo "[${0##*/}] WARN: the S3 archives bucket was not specified in S3_ARCHIVES_BUCKET environment variable"
fi

echo "[${0##*/}] running job $JOB_ID"

# We need to pull down the job's files from S3
aws s3 cp s3://$S3_JOBS_BUCKET/job_$JOB_ID.tar.gz /job.tar.gz

if [ ! -f /job.tar.gz ]; then
  echo "[${0##*/}] ERR: failed to load job archive from S3"
  exit 2
fi

# Unzip the downloaded archive
tar -xf /job.tar.gz -C /grade/

# Users can specify init.sh scripts in several locations:
# 1. in a question's /tests directory (ends up in /grade/tests/)
# 2. in an autograder (ends up in /grade/shared/)
# 3. in an environment (ends up in /grade/)
# We'll only ever run one script; people writing init.sh scripts can choose
# to run others from the one that we call. Which one we run is determined by the
# above ordering: if we find /grade/tests/init.sh, we'll run that, otherwise
# if we find /grade/shared/init.sh, we'll run that, and so on.

if [ -f /grade/tests/init.sh ]; then
  echo "[${0##*/}] running /grade/tests/init.sh"
  chmod +x /grade/tests/init.sh
  /grade/tests/init.sh
elif [ -f /grade/shared/init.sh ]; then
  echo "[${0##*/}] running /grade/shared/init.sh"
  chmod +x /grade/shared/init.sh
  /grade/shared/init.sh
elif [ -f /grade/init.sh ]; then
  echo "[${0##*/}] running /grade/init.sh"
  chmod +x /grade/init.sh
  /grade/init.sh
else
  echo "[${0##*/}] init.sh not found in /grade/tests/, /grade/shared/, or /grade/; skipping"
fi

if [ -f /grade/run.sh ]; then
  chmod +x /grade/run.sh
  sh /grade/run.sh
else
  echo "[${0##*/}] ERR: /grade/run.sh missing"
fi

# Let's zip up /grade and send it back to S3 for forensics
tar -zcf /archive.tar.gz /grade/
aws s3 cp /archive.tar.gz s3://$S3_ARCHIVES_BUCKET/job_$JOB_ID.tar.gz

echo "[${0##*/}] finishing"
