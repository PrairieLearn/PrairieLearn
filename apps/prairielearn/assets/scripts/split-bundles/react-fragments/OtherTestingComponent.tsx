import { registerReactFragment } from '../../behaviors/react-fragments/index.js';

registerReactFragment('OtherTestingComponent', () => <h1>Hello, world!</h1>);

(async () => {
  console.log(import('lodash'));
})().catch(console.error);
