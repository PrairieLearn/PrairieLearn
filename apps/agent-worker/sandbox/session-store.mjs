const sessionStoreBaseUrl = 'http://session-store.internal';

export class HttpSessionStore {
  async append(key, entries) {
    await request('/append', { key, entries });
  }

  async load(key) {
    return (await request('/load', { key })).entries;
  }

  async listSessions(projectKey) {
    return (await request('/list-sessions', { project_key: projectKey })).sessions;
  }

  async listSubkeys(key) {
    return (await request('/list-subkeys', { key })).subkeys;
  }

  async delete(key) {
    await request('/delete', { key });
  }
}

async function request(path, body) {
  const response = await fetch(`${sessionStoreBaseUrl}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!response.ok) throw new Error(`Session store ${path} failed: ${await response.text()}`);
  return await response.json();
}
