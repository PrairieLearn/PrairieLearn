// @ts-check
import core from '@actions/core';
import github from '@actions/github';

function getImages() {
  const images = core.getInput('images');
  return images.split('\n');
}

try {
  const images = getImages();
  const title = core.getInput('title');

  console.log('Hello, world!');
} catch (e) {
  console.error(e);
  core.setFailed(e.message);
}
