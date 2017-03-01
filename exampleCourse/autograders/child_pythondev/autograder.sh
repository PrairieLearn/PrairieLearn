#! /bin/bash

# run the autograder as non-root
# THIS IS IMPORTANT
# for testing purposes we do the piping ourselves
#mkdir student
#cp * ./student
#rm ./student/autograder_wrapper.py
# we have a student, we want to copy in all of shared and then maybe delete our stuff

cd ..

echo "[ag]: cded"

cp shared/* student/
cp /shared/autograder_wrapper.py .
echo "[ag]: copied"
rm student/autograder_wrapper.py
rm student/autograder.sh
rm student/bootstrap.sh
echo "[ag]: removed"

# TODO remove this when we get permissions working!
# PLEASE DON'T DO THIS 
# /grade/shared
sudo chown ag .
sudo chown ag student

echo "[ag] chown"

sudo chmod -R +rw student/

echo "[ag] chmod"

cd student

echo "[ag] cded"

sudo -H -u ag bash -c 'python ../autograder_wrapper.py'

echo "[ag] done"
