import { describe, expect, it } from 'vitest';

import { createApp } from './app.js';

describe('API scaffold', () => {
  it('reports liveness through the public health route', async () => {
    const response = await createApp().request('/api/health/live');

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      service: 'api',
      status: 'ok',
    });
  });
});
