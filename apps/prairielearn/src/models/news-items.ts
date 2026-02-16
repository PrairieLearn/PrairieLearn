import { loadSqlEquiv, queryRow, queryRows } from '@prairielearn/postgres';

import {
  type NewsItem,
  NewsItemSchema,
  type User,
  type NewsItemReadState,
  NewsItemReadStateSchema,
} from '../lib/db-types.js';

const sql = loadSqlEquiv(import.meta.url);

export async function selectUnreadNewsItemsForUser(
  user: Pick<User, 'id'>,
  limit: number,
): Promise<NewsItem[]> {
  return await queryRows(
    sql.select_unread_news_items_for_user,
    { user_id: user.id, limit },
    NewsItemSchema,
  );
}

export async function markNewsItemsAsReadForUser(
  user: Pick<User, 'id'>,
): Promise<NewsItemReadState> {
  return await queryRow(
    sql.upsert_news_item_read_state,
    { user_id: user.id },
    NewsItemReadStateSchema,
  );
}

export interface NewsItemInput {
  title: string;
  link: string;
  pub_date: Date;
  guid: string;
}

export async function upsertNewsItem(item: NewsItemInput): Promise<NewsItem> {
  return await queryRow(
    sql.upsert_news_item,
    {
      title: item.title,
      link: item.link,
      pub_date: item.pub_date,
      guid: item.guid,
    },
    NewsItemSchema,
  );
}

export async function selectAllNewsItems(): Promise<NewsItem[]> {
  return await queryRows(sql.select_all_news_items, NewsItemSchema);
}

export async function hideNewsItem(id: string): Promise<NewsItem> {
  return await queryRow(sql.hide_news_item, { id }, NewsItemSchema);
}

export async function upsertNewsItems(items: NewsItemInput[]): Promise<NewsItem[]> {
  const results: NewsItem[] = [];
  for (const item of items) {
    const result = await upsertNewsItem(item);
    results.push(result);
  }
  return results;
}
