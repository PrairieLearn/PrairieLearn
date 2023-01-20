import os

c.NotebookApp.base_url = "/"
if "WORKSPACE_BASE_URL" in os.environ:
    c.NotebookApp.base_url = os.environ["WORKSPACE_BASE_URL"]

c.NotebookApp.ip = "0.0.0.0"
c.NotebookApp.open_browser = False
c.NotebookApp.password = ""
c.NotebookApp.port = 8080
c.NotebookApp.token = ""
c.NotebookApp.allow_origin = "*"
c.FileContentsManager.delete_to_trash = False
c.FileCheckpoints.checkpoint_dir = "/tmp/ipynb_checkpoints"
