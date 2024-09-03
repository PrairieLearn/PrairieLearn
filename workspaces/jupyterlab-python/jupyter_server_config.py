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

# Environmental variable to set the file that opens at launch of workspace
# File is assumed to be in the workspace folder of the relevant question
# RTC: needs to be appended if using the RTC Drive
drive = "RTC:" if enable_rtc else ""

if "LAUNCH_FILE_NAME" in os.environ:
    c.LabApp.default_url= f"/lab/tree/{drive}{os.environ['LAUNCH_FILE_NAME']}"

c.FileContentsManager.delete_to_trash = False
c.FileCheckpoints.checkpoint_dir = "/tmp/ipynb_checkpoints"
