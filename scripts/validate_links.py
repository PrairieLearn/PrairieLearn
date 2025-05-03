import glob
import os
import re
import sys

URL_REGEX = re.compile(
    r"github\.com/PrairieLearn/PrairieLearn/(?:tree|blob)/master/([-a-zA-Z0-9@:%_+.~#?&//=]*)"
)

files = (
    glob.glob("**/*.md", recursive=True)
    + glob.glob("**/*.html", recursive=True)
    + glob.glob("**/*.json", recursive=True)
)

files = [f for f in files if not f.startswith("node_modules/")]

error = False

for file in files:
    with open(file, encoding="utf8") as f:
        contents = f.read()
    matches = URL_REGEX.findall(contents)
    if matches:
        for path in matches:
            path_clean = re.sub(r"#.*$", "", path)  # Strip hashes
            path_clean = re.sub(r"/$", "", path_clean)  # Remove trailing slash
            if not os.path.exists(path_clean):
                error = True
                print(
                    f"{file}: {path_clean} does not exist in the repo", file=sys.stderr
                )

if error:
    sys.exit(1)
