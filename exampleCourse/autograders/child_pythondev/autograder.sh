#! /bin/bash

# run the autograder as non-root
# THIS IS IMPORTANT

# this file is in /grade/run/autograder.sh, and its working directory will be the root (or either way we can be safe and cd to use anyways)
cd grade/run/

# give the ag user the ownership of it's small bin folder
sudo chown ag bin

echo "[ag] chown"

sudo chmod -R +rw bin/

echo "[ag] chmod"

cd student

echo "[ag] cded"

# we do the capturing ourselves, so that only the stdout of the autograder is used and that we aren't relying on any files that the student code could easily create
# we are also running the autograder as a limited user called ag
sudo -H -u ag bash -c 'python ../autograder_wrapper.py' > results.json

echo "[ag] done"
