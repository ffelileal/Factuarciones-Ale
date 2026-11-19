module.exports = async function handler(request, response) {
  try {
    const { buildServer } = await import('../../../apps/api/dist/server.js');
    const app = buildServer();
    await app.ready();

    let payload = request.body;
    if (payload === undefined && request.method !== 'GET') {
      const chunks = [];
      for await (const chunk of request) {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
      }
      if (chunks.length > 0) {
        payload = JSON.parse(Buffer.concat(chunks).toString('utf8'));
      }
    }

    const companyId = request.query?.companyId;
    const result = await app.inject({
      method: request.method,
      url: `/api/v1/companies/${companyId}`,
      headers: request.headers,
      payload,
    });

    response.statusCode = result.statusCode;
    for (const [name, value] of Object.entries(result.headers)) {
      if (value !== undefined) response.setHeader(name, value);
    }
    response.end(result.body);
  } catch (error) {
    response.statusCode = 500;
    response.setHeader('Content-Type', 'application/json');
    response.end(JSON.stringify({
      error: 'CompanyHandlerError',
      message: error instanceof Error ? error.message : 'No se pudo procesar la empresa.',
    }));
  }
};
