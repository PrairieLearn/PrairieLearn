import Parser from 'rss-parser';

import { logger } from '@prairielearn/logger';

import { type NewsItemInput, upsertCachedNewsItems } from '../models/news-items.js';

import { config } from './config.js';

const parser = new Parser<Record<string, never>, { categories?: string[] }>();

/**
 * Checks if an RSS item has any of the specified category tags.
 */
function hasMatchingCategory(categories: string[], allowedCategories: string[]): boolean {
  if (allowedCategories.length === 0) return true; // No filter = allow all

  const normalizedAllowed = new Set(allowedCategories.map((c) => c.trim().toLowerCase()));
  return categories.some((cat) => normalizedAllowed.has(cat.trim().toLowerCase()));
}

/**
 * Fetches the RSS feed from the configured URL and caches the news items in the database.
 */
export async function fetchAndCacheNewsItems(): Promise<void> {
  const feedUrl = config.newsFeedUrl;
  if (!feedUrl) {
    logger.verbose('news-feed: No news feed URL configured, skipping');
    return;
  }

  try {
    logger.verbose('news-feed: Fetching RSS feed', { feedUrl });

    const feed = await parser.parseURL(feedUrl);

    // Filter to only include items with matching categories
    const allowedCategories = config.newsFeedCategories;
    const items = feed.items.filter((item) =>
      hasMatchingCategory(item.categories ?? [], allowedCategories),
    );

    if (items.length === 0) {
      logger.verbose('news-feed: RSS feed has no matching items', {
        feedUrl,
        totalItems: feed.items.length,
        categories: allowedCategories,
      });
      return;
    }

    const newsItems: NewsItemInput[] = [];
    for (const item of items) {
      const { title, link, pubDate: pubDateStr, guid } = item;

      if (!title || !link || !pubDateStr || !guid) {
        logger.warn('news-feed: Skipping item with missing required fields', { item });
        continue;
      }

      const pubDate = new Date(pubDateStr);
      if (Number.isNaN(pubDate.getTime())) {
        logger.warn('news-feed: Skipping item with invalid pubDate', { pubDateStr, item });
        continue;
      }

      newsItems.push({ title, link, pub_date: pubDate, guid });
    }

    if (newsItems.length > 0) {
      await upsertCachedNewsItems(newsItems);
      logger.verbose('news-feed: Cached news items', { count: newsItems.length });
    }
  } catch (err) {
    logger.error('news-feed: Error fetching or parsing RSS feed', { feedUrl, err });
  }
}
