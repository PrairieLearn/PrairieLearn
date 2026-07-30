// also in config.ts as config.lti13InstancePlatforms
export type LTI13InstancePlatforms = {
  platform: string;
  display_order: number;
  issuer_params?: any;
  custom_fields?: any;
}[];
