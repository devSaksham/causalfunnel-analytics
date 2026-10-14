// Netlify Functions v2 entry: adapts the Fetch-style Request to the same Express app used locally.
import serverless from 'serverless-http';
import { app } from '../../server/app.js';

const handler = serverless(app);

export default async (req) => {
  const url = new URL(req.url);
  const hasBody = req.method !== 'GET' && req.method !== 'HEAD';
  const res = await handler(
    {
      httpMethod: req.method,
      path: url.pathname,
      queryStringParameters: Object.fromEntries(url.searchParams),
      headers: Object.fromEntries(req.headers),
      body: hasBody ? await req.text() : null,
      isBase64Encoded: false,
    },
    {}
  );
  const noBody = res.statusCode === 204 || res.statusCode === 304 || req.method === 'HEAD'; // Response() rejects a body here
  return new Response(noBody ? null : res.isBase64Encoded ? Buffer.from(res.body, 'base64') : res.body, {
    status: res.statusCode,
    headers: res.headers,
  });
};

export const config = { path: '/api/*' };
