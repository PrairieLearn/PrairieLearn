import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Don't perform typechecking, just transpile to keep tests fast.
process.env.TS_NODE_TRANSPILE_ONLY = 'true';

// Always use the tsconfig.json file in the `src` directory, not the one in the
// application root. `ts-node` doesn't seem to like our usage of project references.
process.env.TS_NODE_PROJECT = path.resolve(__dirname, '..', 'tsconfig.json');
