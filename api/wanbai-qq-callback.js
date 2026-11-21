const upstreamCallback = 'https://wb-ba-d2g336r8n2be77b2a-1369604588.ap-shanghai.app.tcloudbase.com/wanbai-app/api/qq/callback';
const maxResponseBytes = 32768;

function createCallbackHandler(fetcher = fetch) {
  return async (req, res) => {
    const send = (status, type, body, headers = {}) => {
      res.writeHead(status, {
        'content-type': type + '; charset=utf-8',
        'content-length': Buffer.byteLength(body),
        'content-disposition': 'inline',
        'cache-control': 'private, no-store, max-age=0',
        'referrer-policy': 'no-referrer',
        'x-content-type-options': 'nosniff',
        'x-frame-options': 'DENY',
        'content-security-policy': "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; frame-ancestors 'none'",
        ...headers,
      });
      res.end(body);
    };
    const plain = (status, body, headers) => send(status, 'text/plain', body, headers);
    if (req.method !== 'GET') return plain(405, 'Method not allowed', { allow: 'GET' });
    if (!req.url || req.url.length > 4096) return plain(400, 'Invalid callback');

    const input = new URL(req.url, 'https://wanbai.xyz');
    const upstream = new URL(upstreamCallback);
    const fields = ['type', 'code', 'state'];
    const hasCallback = fields.some((key) => input.searchParams.has(key));
    if (hasCallback) {
      for (const key of fields) {
        if (input.searchParams.getAll(key).length !== 1) return plain(400, 'Invalid callback');
      }
      const state = input.searchParams.get('state');
      const code = input.searchParams.get('code');
      if (input.searchParams.get('type') !== 'qq' || !/^[a-f0-9]{64}$/.test(state)
        || !code || code.length > 512) return plain(400, 'Invalid callback');
      for (const key of fields) upstream.searchParams.set(key, input.searchParams.get(key));
    }

    try {
      // This is a server request, not a forwarded browser navigation.
      // Never copy browser headers, cookies, or CloudBase credentials.
      const response = await fetcher(upstream, {
        method: 'GET',
        redirect: 'manual',
        headers: { accept: 'text/html, text/plain, application/json' },
        signal: AbortSignal.timeout(12000),
      });
      if (response.status >= 300 && response.status < 400) {
        await response.body?.cancel();
        return plain(502, '\u767b\u5f55\u56de\u8c03\u6682\u65f6\u4e0d\u53ef\u7528\uff0c\u8bf7\u8fd4\u56de App \u91cd\u8bd5');
      }
      const type = (response.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
      if (!['text/html', 'text/plain', 'application/json'].includes(type)) {
        await response.body?.cancel();
        return plain(502, 'Unexpected callback response');
      }
      let size = 0;
      const chunks = [];
      if (response.body) {
        for await (const chunk of response.body) {
          size += chunk.length;
          if (size > maxResponseBytes) return plain(502, 'Callback response too large');
          chunks.push(Buffer.from(chunk));
        }
      }
      const body = Buffer.concat(chunks).toString('utf8');
      if (hasCallback && response.status === 200 && type === 'text/html'
        && !body.includes('com.wanbai.tech://auth/qq?ticket=')) {
        return plain(502, 'Unexpected callback page');
      }
      send(response.status, type, body);
    } catch {
      plain(502, '\u767b\u5f55\u670d\u52a1\u8fde\u63a5\u5931\u8d25\uff0c\u8bf7\u8fd4\u56de App \u91cd\u8bd5');
    }
  };
}

module.exports = createCallbackHandler();
module.exports.createCallbackHandler = createCallbackHandler;

