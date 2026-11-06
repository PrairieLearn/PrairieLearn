import numpy as np


class hf:  # ruff:ignore[invalid-class-name]
    """Stands in for the workspace's helper_function.py, which the sandbox can't import."""

    @staticmethod
    def power_iteration(M, x):
        xc = x.copy()
        for _ in range(100):
            xc = M @ xc
        return xc
