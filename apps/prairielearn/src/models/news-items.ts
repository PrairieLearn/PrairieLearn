import { execute, loadSqlEquiv, queryRow, queryRows } from '@prairielearn/postgres';

import { type NewsItem, NewsItemSchema, type User } from '../lib/db-types.js';

const sql = loadSqlEquiv(import.meta.url);

export async function selectUnreadNewsItemsForUser(user: User, limit: number): Promise<NewsItem[]> {
  return await queryRows(
    sql.select_unread_news_items_for_user,
    { user_id: user.id, limit },
    NewsItemSchema,
  );
}

export async function dismissAllNewsItemsForUser(user: User): Promise<void> {
  await execute(sql.dismiss_all_news_items_for_user, { user_id: user.id });
}

export interface NewsItemInput {
  title: string;
  link: string;
  pub_date: Date;
  guid: string;
  categories: string[];
}

export async function upsertNewsItems(items: NewsItemInput[]): Promise<NewsItem[]> {
  if (items.length === 0) return [];
  return await queryRows(
    sql.upsert_news_items,
    { items: items.map((item) => JSON.stringify(item)) },
    NewsItemSchema,
  );
}

export async function upsertNewsItem(item: NewsItemInput): Promise<NewsItem> {
  const [result] = await upsertNewsItems([item]);
  return result;
}

export async function selectAllNewsItems(): Promise<NewsItem[]> {
  return await queryRows(sql.select_all_news_items, NewsItemSchema);
}

export async function setNewsItemHidden(id: string, hidden: boolean): Promise<NewsItem> {
  return await queryRow(sql.set_news_item_hidden, { id, hidden }, NewsItemSchema);
}

export async function hideNewsItemsNotInGuids(guids: string[]): Promise<void> {
  await execute(sql.hide_news_items_not_in_guids, { guids });
}
