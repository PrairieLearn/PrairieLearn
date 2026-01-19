import { loadSqlEquiv, queryRow, queryRows } from '@prairielearn/postgres';

import {
  type CachedNewsItem,
  CachedNewsItemSchema,
  type UserNewsReadTimestamp,
  UserNewsReadTimestampSchema,
} from '../lib/db-types.js';

const sql = loadSqlEquiv(import.meta.url);

export async function selectUnreadNewsItemsForUser(
  user_id: string,
  limit: number,
): Promise<CachedNewsItem[]> {
  return await queryRows(
    sql.select_unread_news_items_for_user,
    { user_id, limit },
    CachedNewsItemSchema,
  );
}

export async function markNewsItemsAsReadForUser(user_id: string): Promise<UserNewsReadTimestamp> {
  return await queryRow(
    sql.upsert_user_news_read_timestamp,
    { user_id },
    UserNewsReadTimestampSchema,
  );
}

export interface NewsItemInput {
  title: string;
  link: string;
  pub_date: Date;
  guid: string;
}

export async function upsertCachedNewsItem(item: NewsItemInput): Promise<CachedNewsItem> {
  return await queryRow(
    sql.upsert_cached_news_item,
    {
      title: item.title,
      link: item.link,
      pub_date: item.pub_date,
      guid: item.guid,
    },
    CachedNewsItemSchema,
  );
}

export async function upsertCachedNewsItems(items: NewsItemInput[]): Promise<CachedNewsItem[]> {
  const results: CachedNewsItem[] = [];
  for (const item of items) {
    const result = await upsertCachedNewsItem(item);
    results.push(result);
  }
  return results;
}
