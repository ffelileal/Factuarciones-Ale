import type { IncomingMessage, ServerResponse } from 'node:http';
import { buildServer } from '../../apps/api/src/server.js';

const app = buildServer();

export default async function handler(
  req: IncomingMessage,
  res: ServerResponse,
) {
  await app.ready();
  app.server.emit('request', req, res);
}
