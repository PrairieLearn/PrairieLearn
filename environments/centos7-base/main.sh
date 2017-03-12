#!/bin/bash
# NOTE: ${0##*/} expands to the name of this script file
#

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

# Let's zip up /grade and send it back to S3 for forensics
tar -zcf /archive.tar.gz /grade/
aws s3 cp /archive.tar.gz s3://$S3_ARCHIVES_BUCKET/job_$JOB_ID.tar.gz

echo "[${0##*/}] finishing"
