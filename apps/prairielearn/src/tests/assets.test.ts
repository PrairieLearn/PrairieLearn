import { assert } from 'chai';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import fetch from 'node-fetch';

import { config } from '../lib/config';
import * as assets from '../lib/assets';
import { APP_ROOT_PATH } from '../lib/paths';

import * as helperServer from './helperServer';

const SITE_URL = 'http://localhost:' + config.serverPort;
const ELEMENTS_PATH = path.resolve(APP_ROOT_PATH, 'elements');

let cachedElementsInfo: Record<string, any> | null = null;

async function getOrLoadElementsInfo() {
  if (!cachedElementsInfo) {
    const elementsInfo: Record<string, any> = {};

    const elements = await fs.readdir(ELEMENTS_PATH);

    for (const element of elements) {
      const elementInfoPath = path.join(ELEMENTS_PATH, element, 'info.json');
      const elementInfo = JSON.parse(await fs.readFile(elementInfoPath, 'utf-8'));
      elementsInfo[element] = elementInfo;
    }
    cachedElementsInfo = elementsInfo;
  }

  return cachedElementsInfo;
}

describe('Static assets', () => {
  before(helperServer.before());
  after(helperServer.after);

  it('serves all element node_modules assets', async () => {
    const elementsInfo = await getOrLoadElementsInfo();

    // Get all unique node_modules assets.
    const elementAssets = new Set<string>();
    for (const elementName of Object.keys(elementsInfo)) {
      const elementInfo = elementsInfo[elementName];
      const nodeModulesScripts = elementInfo.dependencies?.nodeModulesScripts ?? [];
      const nodeModulesStyles = elementInfo.dependencies?.nodeModulesStyles ?? [];
      [...nodeModulesScripts, ...nodeModulesStyles].forEach((asset) => {
        elementAssets.add(asset);
      });
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

  it('serves all element assets', async () => {
    const elementsInfo = await getOrLoadElementsInfo();

    // Get all unique element assets.
    const elementAssets = new Set<string>();
    for (const elementName of Object.keys(elementsInfo)) {
      const elementInfo = elementsInfo[elementName];
      const elementScripts = elementInfo.dependencies?.elementScripts ?? [];
      const elementStyles = elementInfo.dependencies?.elementStyles ?? [];
      [...elementScripts, ...elementStyles].forEach((asset) => {
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
