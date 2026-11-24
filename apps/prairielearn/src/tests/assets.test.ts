import { createHash } from 'node:crypto';
import * as fs from 'node:fs/promises';
import { createRequire } from 'node:module';
import * as path from 'node:path';

import { afterAll, assert, beforeAll, describe, it } from 'vitest';

import * as assets from '../lib/assets.js';
import { config } from '../lib/config.js';
import { APP_ROOT_PATH } from '../lib/paths.js';

import * as helperServer from './helperServer.js';
import { withConfig } from './utils/config.js';

const SITE_URL = 'http://localhost:' + config.serverPort;
const ELEMENTS_PATH = path.resolve(APP_ROOT_PATH, 'elements');

let cachedElementsInfo: Record<string, any> | null = null;

async function getOrLoadElementsInfo() {
  if (!cachedElementsInfo) {
    const elementsInfo: Record<string, any> = {};

    const elements = await fs.readdir(ELEMENTS_PATH, { withFileTypes: true });

    for (const element of elements) {
      if (!element.isDirectory()) continue;

      const elementInfoPath = path.join(ELEMENTS_PATH, element.name, 'info.json');
      const elementInfo = JSON.parse(await fs.readFile(elementInfoPath, 'utf-8'));
      elementsInfo[element.name] = elementInfo;
    }
    cachedElementsInfo = elementsInfo;
  }

  return cachedElementsInfo;
}

describe('Static assets', () => {
  beforeAll(helperServer.before());
  afterAll(helperServer.after);

  it('returns 404 for pnpm-internal paths through the legacy node_modules route', async () => {
    const res = await fetch(
      `${SITE_URL}/node_modules/.pnpm/superjson@2.2.6/node_modules/superjson/src/util.ts`,
      { redirect: 'manual' },
    );

    assert.equal(res.status, 404);
  });

  it('redirects valid paths through the legacy node_modules route', async () => {
    const assetPath = 'superjson/dist/index.js';
    const res = await fetch(`${SITE_URL}/node_modules/${assetPath}`, { redirect: 'manual' });

    assert.equal(res.status, 302);
    assert.equal(res.headers.get('location'), assets.nodeModulesAssetPath(assetPath));
  });

  it('serves all element node_modules assets', async () => {
    const elementsInfo = await getOrLoadElementsInfo();

    // Get all unique node_modules assets.
    const elementAssets = new Set<string>();
    for (const elementName of Object.keys(elementsInfo)) {
      const elementInfo = elementsInfo[elementName];
      const nodeModulesScripts = elementInfo.dependencies?.nodeModulesScripts ?? [];
      const nodeModulesStyles = elementInfo.dependencies?.nodeModulesStyles ?? [];
      const dynamicNodeModulesScripts = Object.values(
        elementInfo.dynamicDependencies?.nodeModulesScripts ?? {},
      );
      [...nodeModulesScripts, ...nodeModulesStyles, ...dynamicNodeModulesScripts].forEach(
        (asset) => {
          elementAssets.add(asset);
        },
      );
    }

    // Ensure that each asset can be fetched.
    for (const elementAsset of elementAssets) {
      const assetPath = assets.nodeModulesAssetPath(elementAsset);
      const assetUrl = `${SITE_URL}${assetPath}`;
      const res = await fetch(assetUrl, { method: 'HEAD' });
      if (!res.ok) {
        assert.fail(`Failed to fetch ${assetUrl}: ${res.status} ${res.statusText}`);
      }
    }
  });

  it('uses stable content hashes for shared symbolic input assets in production', async () => {
    await withConfig({ devMode: false }, async () => {
      const require = createRequire(import.meta.url);
      const { version } = require('@prairielearn/symbolic-input/package.json');
      for (const asset of [
        '@prairielearn/symbolic-input/dist/index.js',
        '@prairielearn/symbolic-input/style.css',
      ]) {
        const contents = await fs.readFile(require.resolve(asset));
        const hash = createHash('sha256')
          .update(version)
          .update(contents)
          .digest('hex')
          .slice(0, 16);
        const assetPath = assets.nodeModulesAssetPath(asset);

        assert.include(assetPath, `/node_modules/${hash}/`);
        assert.equal(assets.nodeModulesAssetPath(asset), assetPath);

        const res = await fetch(`${SITE_URL}${assetPath}`);
        assert.equal(res.status, 200);
        assert.equal(res.headers.get('cache-control'), 'public, max-age=31536000, immutable');
        assert.equal(await res.text(), contents.toString('utf-8'));
      }
    });
  });

  it('serves all element assets', async () => {
    const elementsInfo = await getOrLoadElementsInfo();

    // Get all unique element assets.
    const elementAssets = new Set<string>();
    for (const elementName of Object.keys(elementsInfo)) {
      const elementInfo = elementsInfo[elementName];
      const elementScripts = elementInfo.dependencies?.elementScripts ?? [];
      const elementStyles = elementInfo.dependencies?.elementStyles ?? [];
      const dynamicElementScripts = Object.values(
        elementInfo.dynamicDependencies?.elementScripts ?? {},
      );
      [...elementScripts, ...elementStyles, ...dynamicElementScripts].forEach((asset) => {
        elementAssets.add(`${elementName}/${asset}`);
      });
    }

    // Ensure that each asset can be fetched.
    for (const elementAsset of elementAssets) {
      const assetPath = assets.coreElementAssetPath(elementAsset);
      const assetUrl = `${SITE_URL}${assetPath}`;
      const res = await fetch(assetUrl, { method: 'HEAD' });
      if (!res.ok) {
        assert.fail(`Failed to fetch ${assetUrl}: ${res.status} ${res.statusText}`);
      }
    }
  });
});
