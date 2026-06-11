import { ServiceManager } from 'ace-linters/build/service-manager';

const manager = new ServiceManager(self);

manager.registerService('json', {
  module: () => import('ace-linters/build/json-service'),
  className: 'JsonService',
  modes: 'json|json5',
});
