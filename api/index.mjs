import { createApiRuntime } from '../apps/api/dist/runtime.js';

const runtime = createApiRuntime();

export default {
  fetch(request) {
    const url = new URL(request.url);
    const rewrittenPath = url.searchParams.get('__path');

    if (rewrittenPath === null) {
      return runtime.app.fetch(request);
    }

    url.pathname = `/api/${rewrittenPath}`;
    url.searchParams.delete('__path');
    url.searchParams.delete('path');

    return runtime.app.fetch(
      new Request(url, {
        body: request.method === 'GET' || request.method === 'HEAD' ? undefined : request.body,
        duplex: 'half',
        headers: request.headers,
        method: request.method,
        redirect: request.redirect,
        signal: request.signal,
      }),
    );
  },
};
