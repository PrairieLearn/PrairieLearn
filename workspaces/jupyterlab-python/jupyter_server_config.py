import os

c = get_config()  # type: ignore # noqa F821

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

c.FileContentsManager.delete_to_trash = False
c.FileCheckpoints.checkpoint_dir = "/tmp/ipynb_checkpoints"
