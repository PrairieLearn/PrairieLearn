#! /bin/bash

# the directory where the class stuff is
AG_DIR='/grade/shared/'

BOOT_SCRIPT='/grade/shared/bootstrap.sh'

# the name of the course script
AG_SCRIPT='autograder.sh'

chmod +x $BOOT_SCRIPT

$BOOT_SCRIPT
