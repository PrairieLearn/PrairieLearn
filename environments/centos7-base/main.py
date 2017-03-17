#!/usr/bin/env python3

import os
import sys
import stat
from subprocess import call
from string import Template

def error(message):
    log(Template('ERR: $message').substitute(message=message))
    sys.stdout.flush()

def warn(message):
    log(Template('WARN: $message').substitute(message=message))
    sys.stdout.flush()

def log(message):
    print(Template('[main] $message').substitute(message=message))
    sys.stdout.flush()

def main():
    log('started')

    if 'JOB_ID' not in os.environ:
        error('job ID was not specified in the JOB_ID environment variable')
        sys.exit(1)

    if 'S3_JOBS_BUCKET' not in os.environ:
        error('the S3 jobs bucket was not specified in S3_JOBS_BUCKET environment variable')
        sys.exit(1)

    if 'S3_RESULTS_BUCKET' not in os.environ:
        error('the S3 results bucket was not specified in the S3_RESULTS_BUCKET environment variable')
        sys.exit(1)

    if 'S3_ARCHIVES_BUCKET' not in os.environ:
        error('the S3 archives bucket was not specified in S3_ARCHIVES_BUCKET environment variable')
        sys.exit(1)

    job_id = os.environ['JOB_ID']
    jobs_bucket = os.environ['S3_JOBS_BUCKET']
    results_bucket = os.environ['S3_RESULTS_BUCKET']
    archives_bucket = os.environ['S3_ARCHIVES_BUCKET']

    log(Template('running job $job').substitute(job=job_id))

    # Load the job archive from S3
    s3_job_file = Template('s3://$bucket/job_$job.tar.gz').substitute(bucket=jobs_bucket, job=job_id)
    s3_fetch_ret = call(['aws', 's3', 'cp', s3_job_file, '/job.tar.gz'])
    if s3_fetch_ret is not 0:
        error('failed to load the job files from S3')
        sys.exit(1)

    # Unzip the downloaded archive
    unzip_ret = call(['tar', '-xf', '/job.tar.gz', '-C', 'grade'])
    if unzip_ret is not 0:
        error('failed to unzip the job archive')
        sys.exit(1)

    # Users can specify init.sh scripts in several locations:
    # 1. in a question's /tests directory (ends up in /grade/tests/)
    # 2. in an autograder (ends up in /grade/shared/)
    # 3. in an environment (ends up in /grade/)
    # We'll only ever run one script; people writing init.sh scripts can choose
    # to run others from the one that we call. Which one we run is determined by the
    # above ordering: if we find /grade/tests/init.sh, we'll run that, otherwise
    # if we find /grade/shared/init.sh, we'll run that, and so on.

    init_files = ['/grade/tests/init.sh', '/grade/shared/init.sh', '/grade/init.sh']
    found_init_script = False
    for file in init_files:
        if os.path.isfile(file):
            found_init_script = True
            call(['chmod', '+x', file])
            init_ret = call([file])
            if init_ret is not 0:
                error(Template('error executing $file').substitute(file=file))
                sys.exit(1)
            break

    # If we get this far, we've run the init script!
    # Let's run the grading script now
    grading_script = '/grade/run.sh'

    if os.path.isfile(grading_script):
        call(['chmod', '+x', grading_script])
        run_ret = call([grading_script])
        if run_ret is not 0:
            error(Template('error executing $file').substitute(file=grading_script))
            sys.exit(1)
    else:
        error(Template('$file not found').substitute(grading_script))
        sys.exit(1)

    # Let's zip up /grade and send it back to S3 for forensics
    zip_ret = call(['tar', '-zcf', '/archive.tar.gz', '/grade/'])
    if zip_ret is not 0:
        error('error zipping up archive')

    if os.path.isfile('/grade/results/results.json'):
        s3_results_file = Template('s3://$bucket/job_$job.json').substitute(bucket=results_bucket, job=job_id)
        s3_results_push_ret = call(['aws', 's3', 'cp', '/grade/results/results.json', s3_results_file])
        if s3_results_push_ret is not 0:
            error('could not push results to S3')
    else:
        error('/grade/results/results.json not found')

    s3_archive_file = Template('s3://$bucket/job_$job.tar.gz').substitute(bucket=archives_bucket, job=job_id)
    s3_archive_push_ret = call(['aws', 's3', 'cp', '/archive.tar.gz', s3_archive_file])
    if s3_archive_push_ret is not 0:
        error('could not push archive to S3')
        sys.exit(1)

    log('finishing')


if __name__ == '__main__':
    main()
