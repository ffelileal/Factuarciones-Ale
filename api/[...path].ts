import type { IncomingMessage, ServerResponse } from 'node:http';
import { buildServer } from '../apps/api/src/server.js';

const app = buildServer();

export default async function handler(
  req: IncomingMessage,
  res: ServerResponse,
) {
  await app.ready();

  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  const response = await app.inject({
    method: req.method as 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE',
    url: req.url,
    headers: req.headers,
    payload: chunks.length > 0 ? Buffer.concat(chunks) : undefined,
  });

  res.statusCode = response.statusCode;
  for (const [name, value] of Object.entries(response.headers)) {
    if (value !== undefined) {
      res.setHeader(name, value as string | number | readonly string[]);
    }
  }
  res.end(response.body);
}
