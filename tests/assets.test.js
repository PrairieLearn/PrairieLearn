// @ts-check
const { assert } = require('chai');
const fs = require('node:fs/promises');
const path = require('node:path');
const fetch = require('node-fetch').default;

const { config } = require('../lib/config');
const assets = require('../lib/assets');

const helperServer = require('./helperServer');

const SITE_URL = 'http://localhost:' + config.serverPort;

describe('Static assets', () => {
  before(helperServer.before());
  after(helperServer.after);

  it('serves all element node_modules assets', async () => {
    const elementsPath = path.resolve(__dirname, '..', 'elements');
    const elements = await fs.readdir(elementsPath);
    console.log(elements);

    const elementAssets = new Set();
    for (const element of elements) {
      const elementInfoPath = path.join(elementsPath, element, 'info.json');
      console.log(elementInfoPath);
      const elementInfo = JSON.parse(await fs.readFile(elementInfoPath, 'utf-8'));
      const nodeModulesScripts = elementInfo.dependencies?.nodeModulesScripts ?? [];
      const nodeModulesStyles = elementInfo.dependencies?.nodeModulesStyles ?? [];
      [...nodeModulesScripts, ...nodeModulesStyles].forEach((asset) => {
        elementAssets.add(asset);
      });
    }

    for (const elementAsset of elementAssets) {
      const assetPath = assets.nodeModulesAssetPath(elementAsset);
      const assetUrl = `${SITE_URL}${assetPath}`;
      console.log(assetUrl);
      const res = await fetch(assetUrl, { method: 'HEAD' });
      if (!res.ok) {
        assert.fail(`Failed to fetch ${assetUrl}: ${res.status} ${res.statusText}`);
      }
    }
  });
});
