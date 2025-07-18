"""Modifications to the default Jupyter Server configuration.

<https://jupyter-server.readthedocs.io/en/latest/other/full-config.html#config-file-and-command-line-options>
"""

import os

c = get_config()  # type: ignore # noqa: F821

c.ServerApp.base_url = "/"
if "WORKSPACE_BASE_URL" in os.environ:
    c.NotebookApp.base_url = os.environ["WORKSPACE_BASE_URL"]

c.ServerApp.port = 8080
c.ServerApp.ip = "0.0.0.0"
c.ServerApp.open_browser = False
c.ServerApp.password = ""
c.ServerApp.token = ""
c.ServerApp.allow_origin = "*"

# RTC appears to be broken in the current version of `jupyter-collaboration`:
# https://github.com/jupyterlab/jupyter-collaboration/issues/162
# This opt-in will only be useful once the underlying issue is resolved.
enable_rtc = bool(os.environ.get("ENABLE_REAL_TIME_COLLABORATION", False))
c.YDocExtension.disable_rtc = not enable_rtc

# `LAUNCH_FILE_NAME` can be set to open a specific file when the workspace is opened.
if "LAUNCH_FILE_NAME" in os.environ:
    # The "RTC" drive needs to be used if real-time collaboration is enabled.
    # This isn't documented, but is discussed in these issues:
    # https://github.com/jupyterlab/jupyter-collaboration/issues/202
    # https://github.com/jupyterlab/jupyter-collaboration/issues/183
    drive = "RTC:" if enable_rtc else ""
    c.LabApp.default_url = f"/lab/tree/{drive}{os.environ['LAUNCH_FILE_NAME']}"

# Used to hide the Python Kernel from R images
if "HIDE_PYTHON_KERNEL" in os.environ:
    c.KernelSpecManager.allowed_kernelspecs = {"ir"}

c.FileContentsManager.delete_to_trash = False
c.FileCheckpoints.checkpoint_dir = "/tmp/ipynb_checkpoints"
