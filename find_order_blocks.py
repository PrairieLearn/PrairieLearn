import csv
import os
import subprocess
import sys


def find_questions_with_order_blocks(root_dir, output_csv):
    # Run ripgrep once to get all matching question.html files
    result = subprocess.run(
        [
            "rg",
            "-l",
            "pl-order-blocks",
            "--glob",
            "question.html",
            "-g",
            "*/questions/**",
            root_dir,
        ],
        check=True,
        capture_output=True,
        text=True,
    )

    matches = result.stdout.strip().splitlines()
    rows = []

    for match in matches:
        match = os.path.normpath(match)
        rel_path = os.path.relpath(match, root_dir)

        # course dir is first part of relative path
        parts = rel_path.split(os.sep)
        if len(parts) < 3:
            continue  # not enough path depth
        course = parts[0]

        # qid is path to dir containing question.html relative to course root
        qid = os.path.relpath(os.path.dirname(match), os.path.join(root_dir, course))

        rows.append((course, qid))

    # Write CSV
    with open(output_csv, "w", newline="") as f:
        writer = csv.writer(f)
        writer.writerow(["course", "qid"])
        writer.writerows(sorted(rows))

    print(f"✅ Wrote {len(rows)} results to {output_csv}")


if __name__ == "__main__":
    if len(sys.argv) != 3:
        print(f"Usage: {sys.argv[0]} ROOT_DIR OUTPUT.csv")
        sys.exit(1)

    root_dir = sys.argv[1]
    output_csv = sys.argv[2]

    find_questions_with_order_blocks(root_dir, output_csv)
