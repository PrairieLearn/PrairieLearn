import os

c.ServerApp.base_url = '/'
if 'WORKSPACE_BASE_URL' in os.environ:
    c.ServerApp.base_url = os.environ['WORKSPACE_BASE_URL']

c.ServerApp.ip = '0.0.0.0'
c.ServerApp.open_browser = False
c.ServerApp.password = ''
c.ServerApp.token = ''
c.ServerApp.allow_origin = '*'
c.FileContentsManager.delete_to_trash = False
c.FileCheckpoints.checkpoint_dir = "/tmp/ipynb_checkpoints"
