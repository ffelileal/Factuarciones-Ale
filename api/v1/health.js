module.exports = async function handler(request, response) {
  try {
    const route = request.query?.__route;
    if (typeof route === 'string' && route.startsWith('/api/v1/')) {
      const { buildServer } = await import('../../apps/api/dist/server.js');
      const app = buildServer();
      await app.ready();

      const result = await app.inject({
        method: request.method,
        url: route,
        headers: request.headers,
      });
      response.statusCode = result.statusCode;
      for (const [name, value] of Object.entries(result.headers)) {
        if (value !== undefined) response.setHeader(name, value);
      }
      response.end(result.body);
      return;
    }

    response.statusCode = 200;
    response.setHeader('Content-Type', 'application/json');
    response.end(JSON.stringify({
      status: 'ok',
      runtime: 'vercel',
      message: 'Serverless function operational',
    }));
  } catch (error) {
    response.statusCode = 500;
    response.setHeader('Content-Type', 'application/json');
    response.end(JSON.stringify({
      error: 'ApiRouteDispatchError',
      message: error instanceof Error ? error.message : 'No se pudo enrutar la API.',
    }));
  }
};
