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
        abs_match = os.path.abspath(match)
        parts = abs_match.split(os.sep)

        if "questions" not in parts:
            continue

        q_index = parts.index("questions")
        course_path = os.sep.join(parts[:q_index])  # absolute course root
        # QID = everything after "questions/"
        qid = os.path.relpath(
            os.path.dirname(abs_match), os.path.join(course_path, "questions")
        )

        rows.append((course_path, qid))

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
