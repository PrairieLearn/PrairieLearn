import { loadSqlEquiv, queryRow, queryRows } from '@prairielearn/postgres';

import {
  type CachedBlogPost,
  CachedBlogPostSchema,
  type UserBlogReadTimestamp,
  UserBlogReadTimestampSchema,
} from '../lib/db-types.js';

const sql = loadSqlEquiv(import.meta.url);

export async function selectUnreadBlogPostsForUser(
  user_id: string,
  limit: number,
): Promise<CachedBlogPost[]> {
  return await queryRows(
    sql.select_unread_blog_posts_for_user,
    { user_id, limit },
    CachedBlogPostSchema,
  );
}

export async function markBlogPostsAsReadForUser(user_id: string): Promise<UserBlogReadTimestamp> {
  return await queryRow(
    sql.upsert_user_blog_read_timestamp,
    { user_id },
    UserBlogReadTimestampSchema,
  );
}

export interface BlogPostInput {
  title: string;
  link: string;
  pub_date: Date;
  guid: string;
}

export async function upsertCachedBlogPost(post: BlogPostInput): Promise<CachedBlogPost> {
  return await queryRow(
    sql.upsert_cached_blog_post,
    {
      title: post.title,
      link: post.link,
      pub_date: post.pub_date,
      guid: post.guid,
    },
    CachedBlogPostSchema,
  );
}

export async function upsertCachedBlogPosts(posts: BlogPostInput[]): Promise<CachedBlogPost[]> {
  const results: CachedBlogPost[] = [];
  for (const post of posts) {
    const result = await upsertCachedBlogPost(post);
    results.push(result);
  }
  return results;
}
