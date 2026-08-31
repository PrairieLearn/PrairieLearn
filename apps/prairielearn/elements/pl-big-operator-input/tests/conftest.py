from __future__ import annotations

import sys
from pathlib import Path

pl_sum_input_root = Path(__file__).resolve().parents[1]
if str(pl_sum_input_root) not in sys.path:
    sys.path.insert(0, str(pl_sum_input_root))
