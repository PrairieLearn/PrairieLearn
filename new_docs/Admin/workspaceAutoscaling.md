# Workspace Autoscaling settings

Different configuration settings of the workspace autoscaling functionality can be set or overridden by updating values in the `config` table.

| Key | Values  | Description  |
|---|---|---|
| `workspaceAutoscalingEnabled` | `true` or `false`   | Enables or disables autoscaling.  Note that this will control the automatic launching and terminating of hosts to maintain a desired host count.  Unhealthy hosts and those that are stuck launching will still always be terminated. |
| `workspaceDesiredHostCount`   | `<nonzero integer>` | Number of desired hosts for autoscaling.  If this key has a value, it will always override the calculated value of desired hosts.  Remove this key if you want to use the calculated value. |
| `workspaceLaunchTemplateId`   | `lt-<id>`           | Launch template ID of the workspace host that will be instantiated by the autoscaling code.  This will override the value in `config.json`. |
