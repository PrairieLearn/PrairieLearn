#!/usr/bin/env python

import argparse
import datetime
import os
import time

import requests


def main():
    parser = argparse.ArgumentParser(
        description="Download all PrairieLearn course data as JSON via the API"
    )
    parser.add_argument(
        "-t", "--token", required=True, help="the API token from PrairieLearn"
    )
    parser.add_argument(
        "-i",
        "--course-instance-id",
        required=True,
        help="the course instance ID to download",
    )
    parser.add_argument(
        "-o",
        "--output-dir",
        required=True,
        help="the output directory to store JSON into (will be created if necessary)",
    )
    parser.add_argument(
        "-s",
        "--server",
        help="the server API address",
        default="https://us.prairielearn.com/pl/api/v1",
    )
    args = parser.parse_args()

    print(f"ensure that {args.output_dir} directory exists...")
    os.makedirs(args.output_dir, exist_ok=True)
    print("successfully ensured directory existence")

    logfilename = os.path.join(args.output_dir, "download_log.txt")
    print(f"opening log file {logfilename} ...")
    with open(logfilename, "w") as logfile:
        print("successfully opened log file")
        download_course_instance(args, logfile)


def download_course_instance(args, logfile):
    log(logfile, f"starting download at {local_iso_time()} ...")
    start_time = time.time()
    course_instance_path = f"/course_instances/{args.course_instance_id}"
    get_and_save_json(course_instance_path, "course_instance_info", args, logfile)
    get_and_save_json(f"{course_instance_path}/gradebook", "gradebook", args, logfile)
    get_and_save_json(
        f"{course_instance_path}/course_instance_access_rules",
        "course_instance_access_rules",
        args,
        logfile,
    )
    assessments = get_and_save_json(
        f"{course_instance_path}/assessments", "assessments", args, logfile
    )

    for assessment in assessments:
        assessment_instances = get_and_save_json(
            f"{course_instance_path}/assessments/{assessment['assessment_id']}/assessment_instances",
            f"assessment_{assessment['assessment_id']}_instances",
            args,
            logfile,
        )

        get_and_save_json(
            f"{course_instance_path}/assessments/{assessment['assessment_id']}/assessment_access_rules",
            f"assessment_{assessment['assessment_id']}_access_rules",
            args,
            logfile,
        )

        for assessment_instance in assessment_instances:
            get_and_save_json(
                f"{course_instance_path}/assessment_instances/{assessment_instance['assessment_instance_id']}/instance_questions",
                f"assessment_instance_{assessment_instance['assessment_instance_id']}_instance_questions",
                args,
                logfile,
            )

            get_and_save_json(
                f"{course_instance_path}/assessment_instances/{assessment_instance['assessment_instance_id']}/submissions",
                f"assessment_instance_{assessment_instance['assessment_instance_id']}_submissions",
                args,
                logfile,
            )

            get_and_save_json(
                f"{course_instance_path}/assessment_instances/{assessment_instance['assessment_instance_id']}/log",
                f"assessment_instance_{assessment_instance['assessment_instance_id']}_log",
                args,
                logfile,
            )

    end_time = time.time()
    log(logfile, f"successfully completed downloaded at {local_iso_time()}")
    log(logfile, f"total time elapsed: {end_time - start_time} seconds")


def get_and_save_json(endpoint, filename, args, logfile):
    url = args.server + endpoint
    headers = {"Private-Token": args.token}
    log(logfile, f"downloading {url} ...")
    start_time = time.time()
    retry_502_max = 30
    retry_502_i = 0
    while True:
        r = requests.get(url, headers=headers)
        if r.status_code == 200:
            break
        if r.status_code == 502:
            retry_502_i += 1
            if retry_502_i >= retry_502_max:
                raise ValueError(
                    f"Maximum number of retries reached on 502 Bad Gateway Error for {url}"
                )
            log(
                logfile,
                f"Bad Gateway Error encountered for {url}, retrying in 10 seconds",
            )
            time.sleep(10)
            continue
        raise ValueError(f"Invalid status returned for {url}: {r.status_code}")
    end_time = time.time()
    log(
        logfile,
        f"successfully downloaded {r.headers['content-length']} bytes in {end_time - start_time} seconds",
    )

    full_filename = os.path.join(args.output_dir, filename + ".json")
    log(logfile, f"saving data to {full_filename} ...")

    with open(full_filename, "w") as out_f:
        out_f.write(r.text)

    log(logfile, "successfully wrote data")

    log(logfile, "parsing data as JSON...")
    data = r.json()
    log(logfile, "successfully parsed JSON")

    return data


def log(logfile, message):
    logfile.write(message + "\n")
    logfile.flush()
    print(message)


def local_iso_time():
    utc_dt = datetime.datetime.now(datetime.timezone.utc)
    dt = utc_dt.astimezone()
    return dt.isoformat()


if __name__ == "__main__":
    main()
