module.exports = async function handler(request, response) {
  try {
    const { buildServer } = await import('../../apps/api/dist/server.js');
    const app = buildServer();
    await app.ready();

    let payload = request.body;
    if (payload === undefined) {
      const chunks = [];
      for await (const chunk of request) {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
      }
      if (chunks.length > 0) {
        payload = JSON.parse(Buffer.concat(chunks).toString('utf8'));
      }
    }

    let publicUrl = request.url;
    const url = new URL(publicUrl, 'http://localhost');

    if (url.pathname === '/api/v1/employee-profile') {
      const companyId = url.searchParams.get('companyId');
      const employeeId = url.searchParams.get('employeeId');
      publicUrl = `/api/v1/companies/${companyId}/employees/${employeeId}/profile`;
    } else if (url.pathname === '/api/v1/company-payroll-workspace') {
      const companyId = url.searchParams.get('companyId');
      publicUrl = `/api/v1/companies/${companyId}/payrolls-workspace`;
    }

    const result = await app.inject({
      method: request.method,
      url: publicUrl,
      headers: request.headers,
      payload,
    });

    response.statusCode = result.statusCode;
    for (const [name, value] of Object.entries(result.headers)) {
      if (value !== undefined) {
        response.setHeader(name, value);
      }
    }
    response.end(result.body);
  } catch (error) {
    response.statusCode = 500;
    response.setHeader('Content-Type', 'application/json');
    response.end(JSON.stringify({
      error: 'ServerInitializationError',
      message: error instanceof Error ? error.message : 'No se pudo iniciar la API.',
    }));
  }
};
