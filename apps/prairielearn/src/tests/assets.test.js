// @ts-check
const { assert } = require('chai');
const fs = require('node:fs/promises');
const path = require('node:path');
const fetch = require('node-fetch').default;

const { config } = require('../lib/config');
const assets = require('../lib/assets');
const { APP_ROOT_PATH } = require('../lib/paths');

const helperServer = require('./helperServer');

const SITE_URL = 'http://localhost:' + config.serverPort;
const ELEMENTS_PATH = path.resolve(APP_ROOT_PATH, 'elements');

/** @type {Record<string, any> | null} */
let cachedElementsInfo = null;

async function getOrLoadElementsInfo() {
  if (!cachedElementsInfo) {
    /** @type {Record<string, any>} */
    const elementsInfo = {};

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
    const elementAssets = new Set();
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
    const elementAssets = new Set();
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
