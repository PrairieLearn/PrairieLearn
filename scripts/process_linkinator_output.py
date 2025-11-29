import json
import sys

if __name__ == "__main__":
    has_broken_links = False
    data = json.load(sys.stdin)

    for link in data["links"]:
        if "BROKEN" in link["state"]:
            has_broken_links = True
            print(link["url"])

    if has_broken_links:
        sys.exit(1)
