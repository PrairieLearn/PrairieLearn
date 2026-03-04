import fetch from 'node-fetch';

import { cache } from '@prairielearn/cache';
import * as error from '@prairielearn/error';
import { logger } from '@prairielearn/logger';

import { config } from './config.js';

async function getAccessToken(): Promise<string> {
  const cachedToken = await cache.get<string>('zoho:access_token');
  if (cachedToken) return cachedToken;

  const params = new URLSearchParams({
    refresh_token: config.zohoRefreshToken ?? '',
    client_id: config.zohoClientId ?? '',
    client_secret: config.zohoClientSecret ?? '',
    grant_type: 'refresh_token',
  });

  const response = await fetch(`https://accounts.zoho.com/oauth/v2/token?${params}`, {
    method: 'POST',
  });

  if (!response.ok) {
    throw new error.AugmentedError('Failed to get Zoho access token', {
      data: { responseCode: response.status, responseText: await response.text() },
    });
  }

  const data = (await response.json()) as { access_token: string; expires_in: number };
  // Cache with a 30s buffer before actual expiry to avoid using a nearly-stale token
  cache.set('zoho:access_token', data.access_token, (data.expires_in - 30) * 1000);
  return data.access_token;
}

export interface ZohoCourseRequestLead {
  firstName: string;
  lastName: string;
  workEmail: string;
  institution: string;
  referralSource: string;
  userUid: string;
  shortName: string;
  title: string;
  githubUser: string | null;
  createdAt: Date;
}

export async function sendCourseRequestLead(lead: ZohoCourseRequestLead): Promise<void> {
  if (!config.zohoClientId || !config.zohoClientSecret || !config.zohoRefreshToken) {
    logger.info('Zoho credentials not configured, skipping lead creation');
    return;
  }

  const accessToken = await getAccessToken();

  const record: Record<string, unknown> = {
    First_Name: lead.firstName,
    Last_Name: lead.lastName,
    Email: lead.workEmail,
    Company: lead.institution,
    Lead_Source: lead.referralSource,
    Secondary_Email: lead.userUid,
    Course_Rubric_and_Number: lead.shortName,
    Course_Title: lead.title,
    Course_request_Date: lead.createdAt.toISOString(),
    Lead_Intent: 'Course Request',
    Course_Status: 'Needs review',
  };

  if (lead.githubUser) {
    record.Course_Owner_Github_Username = lead.githubUser;
  }

  const response = await fetch('https://www.zohoapis.com/crm/v8/Leads', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Zoho-oauthtoken ${accessToken}`,
    },
    body: JSON.stringify({ data: [record] }),
  });

  if (!response.ok) {
    throw new error.AugmentedError('Failed to create Zoho lead', {
      data: { responseCode: response.status, responseText: await response.text() },
    });
  }
}
