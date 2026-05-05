import { fetchAndCacheNewsItems } from '../lib/news-feed.js';

export async function run() {
  await fetchAndCacheNewsItems();
}
