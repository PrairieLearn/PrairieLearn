export function getDefaultHonorCodePledge({
  name,
  groupWork,
}: {
  name: string;
  groupWork: boolean;
}): string[] {
  return [
    `I certify that I am ${name} and ${groupWork ? 'our group is' : 'I am'} allowed to take this assessment.`,
    `${groupWork ? 'We' : 'I'} pledge on ${groupWork ? 'our' : 'my'} honor that ${groupWork ? 'we' : 'I'} will not give or receive any unauthorized assistance on this assessment and that all work will be ${groupWork ? 'our' : 'my'} own.`,
  ];
}
