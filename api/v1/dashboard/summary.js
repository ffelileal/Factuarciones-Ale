module.exports = async function handler(request, response) {
  try {
    const { buildServer } = await import('../../../apps/api/dist/server.js');
    const app = buildServer();
    await app.ready();

    const result = await app.inject({
      method: request.method,
      url: '/api/v1/dashboard/summary',
      headers: request.headers,
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
      error: 'DashboardSummaryHandlerError',
      message: error instanceof Error ? error.message : 'No se pudo cargar el resumen.',
    }));
  }
};
