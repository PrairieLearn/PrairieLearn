import fetch from 'node-fetch';
import * as xml2js from 'xml2js';

import { logger } from '@prairielearn/logger';

import { type BlogPostInput, upsertCachedBlogPosts } from '../models/blog-posts.js';

import { config } from './config.js';

const parser = new xml2js.Parser({ explicitArray: false });

interface RssItem {
  title?: string;
  link?: string;
  pubDate?: string;
  guid?: string | { _: string };
}

interface RssFeed {
  rss?: {
    channel?: {
      item?: RssItem | RssItem[];
    };
  };
}

/**
 * Fetches the RSS feed from the configured URL and caches the posts in the database.
 */
export async function fetchAndCacheBlogPosts(): Promise<void> {
  const feedUrl = config.blogFeedUrl;
  if (!feedUrl) {
    logger.verbose('blog-feed: No blog feed URL configured, skipping');
    return;
  }

  try {
    logger.verbose('blog-feed: Fetching RSS feed', { feedUrl });

    const response = await fetch(feedUrl, {
      headers: {
        'User-Agent': 'PrairieLearn/1.0',
        Accept: 'application/rss+xml, application/xml, text/xml',
      },
    });

    if (!response.ok) {
      logger.error('blog-feed: Failed to fetch RSS feed', {
        feedUrl,
        status: response.status,
        statusText: response.statusText,
      });
      return;
    }

    const xmlText = await response.text();
    const parsed: RssFeed = await parser.parseStringPromise(xmlText);

    const channel = parsed.rss?.channel;
    if (!channel) {
      logger.warn('blog-feed: RSS feed has no channel element', { feedUrl });
      return;
    }

    // Normalize items to an array (xml2js returns a single object if there's only one item)
    const rawItems = channel.item;
    const items: RssItem[] = Array.isArray(rawItems) ? rawItems : rawItems ? [rawItems] : [];

    if (items.length === 0) {
      logger.verbose('blog-feed: RSS feed has no items', { feedUrl });
      return;
    }

    const posts: BlogPostInput[] = [];
    for (const item of items) {
      const title = item.title;
      const link = item.link;
      const pubDateStr = item.pubDate;
      // guid can be a string or an object with _ property
      const guid = typeof item.guid === 'object' ? item.guid._ : item.guid;

      if (!title || !link || !pubDateStr || !guid) {
        logger.warn('blog-feed: Skipping item with missing required fields', { item });
        continue;
      }

      const pubDate = new Date(pubDateStr);
      if (Number.isNaN(pubDate.getTime())) {
        logger.warn('blog-feed: Skipping item with invalid pubDate', { pubDateStr, item });
        continue;
      }

      posts.push({ title, link, pub_date: pubDate, guid });
    }

    if (posts.length > 0) {
      await upsertCachedBlogPosts(posts);
      logger.verbose('blog-feed: Cached blog posts', { count: posts.length });
    }
  } catch (err) {
    logger.error('blog-feed: Error fetching or parsing RSS feed', { feedUrl, err });
  }
}
