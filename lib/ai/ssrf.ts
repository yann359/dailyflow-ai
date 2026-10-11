import { lookup } from 'node:dns/promises';
import { request as httpsRequest } from 'node:https';
import { Readable } from 'node:stream';
import ipaddr from 'ipaddr.js';
import { AIError } from './errors';
export function publicIP(address: string) {
  if (!ipaddr.isValid(address)) return false;
  let parsed = ipaddr.parse(address);
  if (parsed.kind() === 'ipv6' && (parsed as ipaddr.IPv6).isIPv4MappedAddress())
    parsed = (parsed as ipaddr.IPv6).toIPv4Address();
  return parsed.range() === 'unicast';
}
export async function validateCustomURL(value: string) {
  const url = new URL(value);
  const allowed = (process.env.AI_CUSTOM_ALLOWED_HOSTS || '')
    .split(',')
    .map((h) => h.trim().toLowerCase())
    .filter(Boolean);
  if (
    url.protocol !== 'https:' ||
    (url.port && url.port !== '443') ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    !allowed.includes(url.hostname.toLowerCase()) ||
    ipaddr.isValid(url.hostname.replace(/[\[\]]/g, ''))
  )
    throw new AIError(
      'config',
      '自定义接口必须使用 HTTPS，域名须列入服务端 AI_CUSTOM_ALLOWED_HOSTS 白名单。',
      400,
    );
  const addresses = await lookup(url.hostname, { all: true, verbatim: true });
  if (!addresses.length || addresses.some((a) => !publicIP(a.address)))
    throw new AIError(
      'config',
      '禁止访问本机、内网、保留地址或云元数据服务。',
      400,
    );
  return { url, address: addresses[0] };
}
export async function customFetch(
  url: string,
  init: RequestInit,
): Promise<Response> {
  const target = await validateCustomURL(url);
  // Pin the checked DNS result for the TLS connection; no redirects and no DNS rebinding window.
  return new Promise((resolve, reject) => {
    const req = httpsRequest(
      target.url,
      {
        method: init.method || 'GET',
        headers: init.headers as Record<string, string>,
        lookup: (_host, _opts, cb) =>
          cb(null, target.address.address, target.address.family),
        servername: target.url.hostname,
        signal: init.signal || undefined,
      },
      (res) => {
        const status = res.statusCode || 502;
        if (status >= 300 && status < 400) {
          res.destroy();
          reject(new AIError('config', '自定义接口禁止重定向。'));
          return;
        }
        resolve(
          new Response(Readable.toWeb(res) as ReadableStream<Uint8Array>, {
            status,
            headers: {
              'content-type': String(res.headers['content-type'] || ''),
            },
          }),
        );
      },
    );
    req.on('error', reject);
    req.end(init.body || undefined);
  });
}
