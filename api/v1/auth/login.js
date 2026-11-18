module.exports = async function handler(request, response) {
  try {
    const { buildServer } = await import('../../../apps/api/dist/server.js');
    const app = buildServer();
    await app.ready();

    const chunks = [];
    for await (const chunk of request) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }

    const result = await app.inject({
      method: request.method,
      url: '/api/v1/auth/login',
      headers: request.headers,
      payload: chunks.length > 0
        ? Buffer.concat(chunks).toString('utf8')
        : undefined,
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
      error: 'LoginHandlerError',
      message: error instanceof Error ? error.message : 'No se pudo iniciar el login.',
    }));
  }
};
