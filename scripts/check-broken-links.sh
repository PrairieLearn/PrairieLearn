#!/bin/bash

# Finds broken links in the source code. There are a couple of false positives, inspect manually.
# You must install lychee to use this script (https://github.com/lycheeverse/lychee).
set -ex

lychee 'apps/prairielearn/src/**/*.ts' 'apps/prairielearn/src/**/*.tsx' \
    --exclude-path node_modules \
    --exclude 'localhost' \
    --exclude '127\.0\.0\.1' \
    --exclude 'github\.com' \
    --exclude 'example\.com' \
    --exclude 'purl\.imsglobal\.org' \
    --timeout 30

# purl.imsglobal.org acts like a namespace; not a URL
