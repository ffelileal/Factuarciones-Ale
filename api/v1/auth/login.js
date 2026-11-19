module.exports = async function handler(request, response) {
  let body;
  let rawLength = 0;
  try {
    const chunks = [];
    for await (const chunk of request) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    if (chunks.length > 0) {
      const rawBody = Buffer.concat(chunks).toString('utf8');
      rawLength = rawBody.length;
      body = JSON.parse(rawBody);
    }
    if (!body || typeof body !== 'object') {
      response.statusCode = 400;
      response.setHeader('Content-Type', 'application/json');
      response.end(JSON.stringify({
        error: 'ValidationError',
        message: 'El cuerpo de la solicitud debe ser un objeto JSON.',
      }));
      return;
    }

    const [{ LoginRequestSchema }, { authService }] = await Promise.all([
      import('../../../packages/contracts/dist/index.js'),
      import('../../../apps/api/dist/services/auth.service.js'),
    ]);
    const parsed = LoginRequestSchema.parse(body);
    const result = await authService.login({
      email: parsed.email,
      password: parsed.password,
      deviceName: parsed.deviceName ?? 'Vercel Web Client',
      ipAddress: request.headers['x-forwarded-for']?.toString().split(',')[0]?.trim() ?? '127.0.0.1',
    });

    response.statusCode = 200;
    response.setHeader('Content-Type', 'application/json');
    response.end(JSON.stringify(result));
  } catch (error) {
    const statusCode =
      typeof error?.statusCode === 'number' ? error.statusCode :
      error?.name === 'ZodError' ? 400 : 500;
    response.setHeader('Content-Type', 'application/json');
    response.statusCode = statusCode;
    const bodyType = typeof body;
    const bodyLength = typeof body === 'string'
      ? body.length
      : body && typeof body === 'object'
        ? Object.keys(body).length
        : 0;
    response.end(JSON.stringify({
      error: error?.name ?? 'LoginHandlerError',
      message: error instanceof Error ? error.message : 'No se pudo iniciar el login.',
      diagnostic: { bodyType, bodyLength, rawLength },
    }));
  }
};
