# This is a shim to prairielearn.to_precision and will be removed in the future.
import sys

sys.path.append("..")
from prairielearn.to_precision import *  # noqa: F403
