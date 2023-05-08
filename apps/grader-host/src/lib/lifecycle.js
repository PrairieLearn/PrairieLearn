const assert = require('assert');
const AWS = require('aws-sdk');

const logger = require('./logger');
const { config } = require('./config');

/**
 * Stores our current state. We do one-way transitions:
 *    null -> Launching -> InService
 * or
 *    null -> Launching -> AbandoningLaunch
 */
let lifecycleState = null;

module.exports.getState = () => {
  return lifecycleState;
};

module.exports.init = async () => {
  if (config.autoScalingGroupName == null) {
    logger.info('lifecycle.init(): not running in AutoScalingGroup');
    return;
  }

  assert.equal(lifecycleState, null);
  lifecycleState = 'Launching';
  logger.info(`lifecycle.init(): changing to state ${lifecycleState}`);
  heartbeat();
};

module.exports.inService = async () => {
  if (config.autoScalingGroupName == null) {
    logger.info('lifecycle.inService(): not running in AutoScalingGroup');
    return;
  }

  assert.equal(lifecycleState, 'Launching');
  lifecycleState = 'InService';
  logger.info(`lifecycle.inService(): changing to state ${lifecycleState}`);

  const autoscaling = new AWS.AutoScaling();
  const params = {
    AutoScalingGroupName: config.autoScalingGroupName,
    LifecycleActionResult: 'CONTINUE',
    LifecycleHookName: 'launching',
    InstanceId: config.instanceId,
  };
  try {
    await autoscaling.completeLifecycleAction(params).promise();
    logger.info('lifecycle.inService(): completed action', params);
  } catch (e) {
    // don't return the error, because there is nothing to be done about it
    logger.error('lifecycle.inSerice(): error completing action', params);
  }
};

module.exports.abandonLaunch = async () => {
  if (config.autoScalingGroupName == null) {
    logger.info('lifecycle.abandonLaunch(): not running in AutoScalingGroup');
    return;
  }

  if (lifecycleState === 'Launching') {
    lifecycleState = 'AbandoningLaunch';
    logger.info(`lifecycle.abandonLaunch(): changing to state ${lifecycleState}`);

    const autoscaling = new AWS.AutoScaling();
    const params = {
      AutoScalingGroupName: config.autoScalingGroupName,
      LifecycleActionResult: 'ABANDON',
      LifecycleHookName: 'launching',
      InstanceId: config.instanceId,
    };
    try {
      await autoscaling.completeLifecycleAction(params).promise();
      logger.info('lifecycle.abandonLaunch(): completed action', params);
    } catch (e) {
      // don't return the error, because there is nothing to be done about it
      logger.error('lifecycle.abandonLaunch(): error completing action', params);
    }
  } else {
    logger.info(`lifecycle.abandonLaunch(): in state ${lifecycleState}, taking no action`);
  }
};

function heartbeat() {
  if (lifecycleState === 'Launching') {
    logger.info('lifecycle.heartbeat(): sending heartbeat...');
    const autoscaling = new AWS.AutoScaling();
    const params = {
      AutoScalingGroupName: config.autoScalingGroupName,
      LifecycleHookName: 'launching',
      InstanceId: config.instanceId,
    };
    autoscaling.recordLifecycleActionHeartbeat(params, (err, _data) => {
      if (err) return logger.error('lifecycle.heartbeat(): ERROR', err);
      setTimeout(heartbeat, config.lifecycleHeartbeatIntervalMS);
    });
  } else {
    logger.info(`lifecycle.heartbeat(): in state ${lifecycleState}, not sending heartbeat`);
  }
}
