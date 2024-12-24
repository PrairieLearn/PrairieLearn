# This is a shim to prairielearn.sympy_utils and will be removed in the future.
import sys

sys.path.append("..")
from prairielearn.sympy_utils import *  # noqa: F403
from prairielearn.sympy_utils import _Constants  # noqa: F401
