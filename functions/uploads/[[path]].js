export async function onRequestGet(context) {
  const { env, request } = context;
  if (!env.UPLOADS) {
    return new Response('Cloudflare R2 binding UPLOADS 未配置', { status: 500 });
  }

  const url = new URL(request.url);
  const key = decodeURIComponent(url.pathname.replace(/^\/uploads\/?/, ''));
  if (!key) return new Response('Not found', { status: 404 });

  const object = await env.UPLOADS.get(key);
  if (!object) return new Response('Not found', { status: 404 });

  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set('etag', object.httpEtag);
  headers.set('Cache-Control', 'public, max-age=31536000, immutable');

  return new Response(object.body, { headers });
}
