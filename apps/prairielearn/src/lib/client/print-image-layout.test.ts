import { JSDOM } from 'jsdom';
import { expect, it, vi } from 'vitest';

import { waitForPrintImages } from './print-image-layout.js';

it('waits for images in the question and its shadow roots', async () => {
  const document = new JSDOM('<div id="source"><img src="light.png"><div id="host"></div></div>')
    .window.document;
  const source = document.querySelector<HTMLElement>('#source')!;
  const lightImage = source.querySelector('img')!;
  const shadowImage = document.createElement('img');
  shadowImage.src = 'shadow.png';
  source.querySelector('#host')!.attachShadow({ mode: 'open' }).append(shadowImage);

  let finishShadowDecode!: () => void;
  const shadowDecode = new Promise<void>((resolve) => {
    finishShadowDecode = resolve;
  });
  for (const image of [lightImage, shadowImage]) {
    Object.defineProperties(image, {
      complete: { value: true },
      naturalWidth: { value: 100 },
    });
  }
  const lightDecode = vi.fn(async () => undefined);
  const decodeShadow = vi.fn(() => shadowDecode);
  lightImage.decode = lightDecode;
  shadowImage.decode = decodeShadow;

  let complete = false;
  const waiting = waitForPrintImages(source).then(() => {
    complete = true;
  });
  await Promise.resolve();
  expect(lightDecode).toHaveBeenCalledOnce();
  expect(decodeShadow).toHaveBeenCalledOnce();
  expect(complete).toBe(false);

  finishShadowDecode();
  await waiting;
  expect(complete).toBe(true);
});
