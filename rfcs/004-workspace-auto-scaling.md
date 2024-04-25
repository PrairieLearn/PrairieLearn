# Summary

This is a rough outline of the notes for setting up AWS autoscaling for PrairieLearn's container workspaces functionality.

<!-- This was auto-converted to markdown from org mode, which is why you might see some strange links -->

# Table of Contents

1.  [Workspaces autoscaling notes](#org0a4f21f)
    1.  [Code changes](#org4b4bf2c)
    2.  [AWS setup](#org874aef4)
    3.  [CloudWatch](#org3bd0531)

<a id="org0a4f21f"></a>

# Workspaces autoscaling notes

<a id="org4b4bf2c"></a>

## Code changes

- two strategies: use either aws autoscaling, or roll own

  - external graders use aws autoscaling
  - for workspaces we should roll our own because we need the extra flexibility
    - can't use aws autoscaling because we don't have a 'jobs' model

- use aws primitives like 'run instance' and 'terminate instance'

  - (double check names in ec2 api)

- use a state machine to keep track of workspace hosts

  - launching / starting
  - ready
  - alive, but no more jobs (draining)
    - once no more jobs this host should be killed off
    - periodically check and kill them off
  - unhealthy
  - terminating
  - terminated

- state transitions

  - workspace host:
    - ready
    - unhealthy
      - docker errors, or local errors we can't run workspaces
      - set unhealthy for any error to be safe
      - mark self as unhealthy in db
  - main pl server:
    - launching / starting
    - draining
    - unhealthy
      - check ready and draining hosts
      - ping the workspace host every so often and check status
      - in status route check we can actually read database
        - if no db access we are in catastrophic state
      - check if we can talk to docker
        - docker ps
    - terminating
      - cron job
    - terminated
      - cron job

- job allocation:

  - instead of "most recent with empty slots", pick one at random

- load balancing:

  - figure out desired number of hosts

  - number of jobs on ready hosts - multiplied by some safety factor

    - n jobs = n + 2 \* (n \*\* 0.5)

    - compute desired job capacity = n + 2 \* (n \*\* 0.5)
    - desired host capacity = desired job capacity / jobs per host
    - anticipatory scaling:

      - **future enhancements**
      - how many people are currently looking at a question that has a workspace button OR
        doing an assessment that has a workspace question OR
        how many people are about to start an exam with a workspace question

    - compare to actual number of hosts in state ready or launching
    - if desired < actual:
      - mark some number as "draining"
    - if desired > actual:
      - check if any are "draining" - shift back to ready
      - if still not enough, launch more
    - run in cron job every 10s

- killing off hosts:

  - run in same cron job
    - any draining hosts w/o running jobs shift to terminating & terminate
    - any unhealthy hosts w/o running jobs shift to terminating & terminate
    - any unhealthy host unhealthy over 12 hours terminate
  - process
    - mark as terminating in db
    - send ec2 command to terminate

- host consistency cron job

  - ask ec2 for list of hosts
  - compare to db
  - try to make consistent
    - any host not in list should be "terminated"
    - any host in list but NOT in db kill off
      - insert into db as terminating
      - send terminate signal

- save host launching timestamp

  - periodically find hosts that have been launching for "too long"

- for future:
  - add more robust health checks

<a id="org874aef4"></a>

## AWS setup

- maintain a pool of instances
- have a tag for pool

  - workspace host tag
  - add tag to any launched hosts
  - getting instances: filter by tag

- aws calls

  - run instance
    - returns an instance id
    - put into hosts table
  - list instance / get instances
    - filter by tag
  - terminate instance

- launching instance

  - need launch template as config
    - specifies ami
    - disks, memory, etc.
  - create launch template by hand
  - specify template name in config

- launch template

  - use cloud formation
    - specify "resources" as a json file in ansible repo
    - specify AMI
  - use cloud formation for AMI
    - make a reference instance
    - take the running instance and create an AMI from it
      - this returns the ID of the AMI that was created

- use <https://github.com/PrairieLearn/ansible-pl/blob/master/prairiegrader/grader-instance.json> as base
- <https://github.com/PrairieLearn/ansible-pl/blob/master/prairiegrader/grader-fleet.json> as launch configuration / launch template
- add another layer of config parsing to load config from secrets
- name of the conf secret is stored as \`ConfSecret\` tag
  - needs to be done before db initialization even
  - happens when we load config.json
- copy secret code from prairiegrader

- manual scaling settings:

  - could add values to config table
    - `workspaceAutoscalingEnabled`: `true/false`
    - `workspaceDesiredHostCount`: `some number`
    - `workspaceLaunchTemplateId`: `some id`

- can use ssh on the instances for debugging

<a id="org3bd0531"></a>

## CloudWatch

- <https://github.com/PrairieLearn/PrairieLearn/blob/master/apps/prairielearn/src/cron/externalGraderLoad.ts>
- <https://github.com/PrairieLearn/PrairieLearn/blob/master/apps/prairielearn/src/sprocs/grader_loads_current.sql>

- Write into same time series table as external grader
  - put workspace\_ prefix on all workspace values
  - calculating:
    - facts about the hosts
      - i.e. how many hosts in each state
    - facts about workspaces/jobs
      - how many in each state
      - information about age of jobs
        - max time in each state
    - all variables as part of autoscaling calculations
      - desired job capacity = n + 2 \* (n \*\* 0.5)
      - desired host capacity = desired job capacity / jobs per host
