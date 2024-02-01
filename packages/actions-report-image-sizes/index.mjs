import './setup.mjs';

// import core from '@actions/core';
// import github from '@actions/github';

function getImages() {
  // const images = core.getInput('images');
  const images = '';
  return images.split(',');
}

try {
  const images = getImages();
  // const title = core.getInput('title');

  console.log('Hello, world!', images, title);
} catch (e) {
  console.error(e);
  // core.setFailed(e.message);
}
