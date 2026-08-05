export default {
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    if (url.hostname.toLowerCase() === 'api.bibliotecai.com.br') {
      const apiUrl = new URL(`https://bibliotecai-api-gateway.bibliotecai.workers.dev${url.pathname}${url.search}`);
      const headers = new Headers(request.headers);
      headers.delete('host');

      return fetch(apiUrl, {
        method: request.method,
        headers,
        body: request.body,
        redirect: 'manual',
      });
    }

    const pagesUrl = new URL(`https://bibliotecai.pages.dev${url.pathname}${url.search}`);

    const response = await fetch(pagesUrl, {
      method: request.method,
      headers: request.headers,
      body: request.body,
    });

    const newHeaders = new Headers(response.headers);
    newHeaders.set('X-Frame-Options', 'SAMEORIGIN');
    newHeaders.set('X-Content-Type-Options', 'nosniff');
    newHeaders.set('Referrer-Policy', 'strict-origin-when-cross-origin');

    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: newHeaders,
    });
  },
};
