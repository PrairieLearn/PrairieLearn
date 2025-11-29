import json
import sys

if __name__ == "__main__":
    data = json.load(sys.stdin)

    for link in data["links"]:
        if "BROKEN" in link["state"]:
            print(link["url"])
