import numpy as np


class hf:  # ruff:ignore[invalid-class-name]
    """Stands in for the workspace's helper_function.py, which the sandbox can't import."""

    def power_iteration(M, x):  # ruff:ignore[invalid-first-argument-name-for-method]
        xc = x.copy()
        for _ in range(100):
            xc = M @ xc
        return xc
