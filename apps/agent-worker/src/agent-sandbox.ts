import { ContainerProxy, Sandbox } from '@cloudflare/sandbox';

export { ContainerProxy };

export class AgentSandbox extends Sandbox<Cloudflare.Env> {
  enableInternet = false;
  allowedHosts: string[] = [];
}
