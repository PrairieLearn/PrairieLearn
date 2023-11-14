#!/bin/bash
#sudo docker run -it --rm -p 3000:3000 -v /mnt/c/Users/mitch/Programming/VSCODE/sdmay24-33:/course prairielearn/prairielearn

sudo docker run -it --rm -p 3000:3000 -w /PrairieLearn -v ~/PrairieLearn:/PrairieLearn -v /mnt/c/Users/mitch/Programming/VSCODE/sdmay24-33:/course prairielearn/prairielearn /bin/bash
