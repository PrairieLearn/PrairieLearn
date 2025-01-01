import { fileURLToPath } from 'url';

export const pf = (dirname: string | undefined, url: string) => {
  return dirname ? [dirname] : [fileURLToPath(url), '..'];
};
