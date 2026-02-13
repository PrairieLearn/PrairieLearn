import * as cheerio from 'cheerio';
import { describe, expect, it } from 'vitest';

import { stripHtmlForAiGrading } from './ai-grading-render.js';

describe('stripHtmlForAiGrading', () => {
  it('removes style attributes by default', async () => {
    const result = await stripHtmlForAiGrading(
      '<p style="background-color: red; color: blue">Highlighted answer</p>',
    );

    const $ = cheerio.load(result);
    expect($('p').attr('style')).toBeUndefined();
    expect($('p').text()).toBe('Highlighted answer');
  });

  it('preserves only requested style properties', async () => {
    const result = await stripHtmlForAiGrading(
      '<p style="BACKGROUND-COLOR: rgb(255, 0, 0); color: blue">Highlighted answer</p>',
      {
        preservedStyleProperties: ['Background-Color'],
      },
    );

    const $ = cheerio.load(result);
    expect($('p').attr('style')).toBe('background-color: rgb(255, 0, 0)');
  });

  it('keeps only the final value for repeated preserved properties', async () => {
    const result = await stripHtmlForAiGrading(
      '<p style="background-color: yellow; color: blue; background-color: red">Highlighted answer</p>',
      {
        preservedStyleProperties: ['background-color'],
      },
    );

    const $ = cheerio.load(result);
    expect($('p').attr('style')).toBe('background-color: red');
  });

  it('keeps only the final value for repeated preserved properties with mixed case', async () => {
    const result = await stripHtmlForAiGrading(
      '<p style="background-color: yellow; BACKGROUND-COLOR: red">Highlighted answer</p>',
      {
        preservedStyleProperties: ['background-color'],
      },
    );

    const $ = cheerio.load(result);
    expect($('p').attr('style')).toBe('background-color: red');
  });

  it('parses semicolons inside style values correctly', async () => {
    const result = await stripHtmlForAiGrading(
      '<p style=\'content:"a;b"; color: blue; background-color: yellow\'>Highlighted answer</p>',
      {
        preservedStyleProperties: ['content', 'background-color'],
      },
    );

    const $ = cheerio.load(result);
    expect($('p').attr('style')).toBe('content: "a;b"; background-color: yellow');
  });

  it('keeps existing stripping behavior for hidden and bootstrap elements', async () => {
    const result = await stripHtmlForAiGrading(
      [
        '<div>',
        '  <span aria-hidden="true">Hidden</span>',
        '  <span data-bs-toggle="tooltip" style="background-color: yellow; color: blue">Shown</span>',
        '</div>',
      ].join(''),
      {
        preservedStyleProperties: ['background-color'],
      },
    );

    const $ = cheerio.load(result);
    expect($('span').length).toBe(1);
    expect($('span').attr('data-bs-toggle')).toBeUndefined();
    expect($('span').attr('style')).toBe('background-color: yellow');
    expect($('span').text()).toBe('Shown');
  });
});
