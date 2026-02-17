import * as cheerio from 'cheerio';
import { describe, expect, it } from 'vitest';

import { stripHtmlForAiGrading } from './ai-grading-render.js';

describe('stripHtmlForAiGrading', () => {
  it('removes elements with aria-hidden="true"', async () => {
    const result = await stripHtmlForAiGrading(
      '<div><span aria-hidden="true">Hidden</span><span>Visible</span></div>',
    );

    const $ = cheerio.load(result);
    expect($('span').length).toBe(1);
    expect($('span').text()).toBe('Visible');
  });

  it('removes id attributes', async () => {
    const result = await stripHtmlForAiGrading('<p id="my-id">Text</p>');

    const $ = cheerio.load(result);
    expect($('p').attr('id')).toBeUndefined();
    expect($('p').text()).toBe('Text');
  });

  it('removes class attributes', async () => {
    const result = await stripHtmlForAiGrading('<p class="my-class">Text</p>');

    const $ = cheerio.load(result);
    expect($('p').attr('class')).toBeUndefined();
    expect($('p').text()).toBe('Text');
  });

  it('removes data-bs-* attributes', async () => {
    const result = await stripHtmlForAiGrading(
      '<span data-bs-toggle="tooltip" data-bs-placement="top">Text</span>',
    );

    const $ = cheerio.load(result);
    expect($('span').attr('data-bs-toggle')).toBeUndefined();
    expect($('span').attr('data-bs-placement')).toBeUndefined();
    expect($('span').text()).toBe('Text');
  });

  describe('style attributes', () => {
    it('removes non-highlight style properties', async () => {
      const result = await stripHtmlForAiGrading(
        '<p style="font-size: 14px; background-color: red">Highlighted answer</p>',
      );

      const $ = cheerio.load(result);
      expect($('p').attr('style')).toBe('background-color: red');
    });

    it('preserves color and background-color', async () => {
      const result = await stripHtmlForAiGrading(
        '<p style="BACKGROUND-COLOR: rgb(255, 0, 0); color: blue">Highlighted answer</p>',
      );

      const $ = cheerio.load(result);
      expect($('p').attr('style')).toBe('background-color: rgb(255, 0, 0); color: blue');
    });

    it('removes style attribute when no highlight properties are present', async () => {
      const result = await stripHtmlForAiGrading(
        '<p style="font-size: 14px; margin: 0">Plain answer</p>',
      );

      const $ = cheerio.load(result);
      expect($('p').attr('style')).toBeUndefined();
    });

    it('does not preserve style properties that only include a preserved name as a substring', async () => {
      const result = await stripHtmlForAiGrading(
        '<p style="border-color: red; margin: 0">Plain answer</p>',
      );

      const $ = cheerio.load(result);
      expect($('p').attr('style')).toBeUndefined();
    });

    it('keeps only the final value for repeated preserved properties', async () => {
      const result = await stripHtmlForAiGrading(
        '<p style="background-color: yellow; color: blue; background-color: red">Highlighted answer</p>',
      );

      const $ = cheerio.load(result);
      expect($('p').attr('style')).toBe('background-color: red; color: blue');
    });

    it('keeps only the final value for repeated preserved properties with mixed case', async () => {
      const result = await stripHtmlForAiGrading(
        '<p style="background-color: yellow; BACKGROUND-COLOR: red">Highlighted answer</p>',
      );

      const $ = cheerio.load(result);
      expect($('p').attr('style')).toBe('background-color: red');
    });

    it('parses semicolons inside style values correctly', async () => {
      const result = await stripHtmlForAiGrading(
        '<p style=\'content:"a;b"; color: blue; background-color: yellow\'>Highlighted answer</p>',
      );

      const $ = cheerio.load(result);
      expect($('p').attr('style')).toBe('color: blue; background-color: yellow');
    });
  });
});
