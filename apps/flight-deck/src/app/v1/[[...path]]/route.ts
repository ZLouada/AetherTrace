import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

async function proxyRequest(
  request: NextRequest,
  context: { params: Promise<{ path?: string[] }> }
) {
  const { path } = await context.params;
  const subPath = path && path.length > 0 ? `/${path.join('/')}` : '';
  const targetBase = process.env.PROXY_SERVER_URL || process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';
  const targetUrl = new URL(`/v1${subPath}${request.nextUrl.search}`, targetBase);

  const headers = new Headers(request.headers);
  headers.delete('host');

  try {
    const init: RequestInit = {
      method: request.method,
      headers,
      body: request.method !== 'GET' && request.method !== 'HEAD' ? await request.blob() : undefined,
    };

    const res = await fetch(targetUrl, init);
    return new NextResponse(res.body, {
      status: res.status,
      statusText: res.statusText,
      headers: res.headers,
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: { message: `Proxy error forwarding to proxy-server: ${error.message || String(error)}` } },
      { status: 502 }
    );
  }
}

export const GET = proxyRequest;
export const POST = proxyRequest;
export const PUT = proxyRequest;
export const DELETE = proxyRequest;
export const PATCH = proxyRequest;
export const OPTIONS = proxyRequest;
