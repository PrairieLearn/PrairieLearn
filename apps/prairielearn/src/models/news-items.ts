import { execute, loadSqlEquiv, queryRow, queryRows } from '@prairielearn/postgres';

import {
  type NewsItem,
  type NewsItemReadState,
  NewsItemReadStateSchema,
  NewsItemSchema,
  type User,
} from '../lib/db-types.js';

const sql = loadSqlEquiv(import.meta.url);

export async function selectUnreadNewsItemsForUser(user: User, limit: number): Promise<NewsItem[]> {
  return await queryRows(
    sql.select_unread_news_items_for_user,
    { user_id: user.id, limit },
    NewsItemSchema,
  );
}

export async function markNewsItemsAsReadForUser(user: User): Promise<NewsItemReadState> {
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

export async function setNewsItemHidden(id: string, hidden: boolean): Promise<NewsItem> {
  return await queryRow(sql.set_news_item_hidden, { id, hidden }, NewsItemSchema);
}

export async function upsertNewsItems(items: NewsItemInput[]): Promise<NewsItem[]> {
  const results: NewsItem[] = [];
  for (const item of items) {
    const result = await upsertNewsItem(item);
    results.push(result);
  }
  return results;
}

export async function hideNewsItemsNotInGuids(guids: string[]): Promise<void> {
  await execute(sql.hide_news_items_not_in_guids, { guids });
}
