import { fetchAndCacheBlogPosts } from '../lib/blog-feed.js';

export async function run() {
  await fetchAndCacheBlogPosts();
}
