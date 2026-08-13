import { NextResponse } from 'next/server';

export function middleware(request) {
  // Completely stop the app and disconnect from Vercel/Server
  return new NextResponse(
    `<!DOCTYPE html>
    <html lang="uz">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Dastur To'xtatilgan</title>
      <style>
        body {
          font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
          background: #0f172a;
          color: #f8fafc;
          display: flex;
          height: 100vh;
          align-items: center;
          justify-content: center;
          margin: 0;
        }
        .card {
          background: #1e293b;
          padding: 2.5rem;
          border-radius: 1rem;
          box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.5);
          text-align: center;
          max-width: 480px;
          border: 1px solid #334155;
        }
        .icon { font-size: 4rem; margin-bottom: 1rem; }
        h1 { color: #ef4444; font-size: 1.75rem; margin-bottom: 0.75rem; margin-top: 0; }
        p { color: #94a3b8; font-size: 1.05rem; line-height: 1.6; margin-bottom: 0; }
      </style>
    </head>
    <body>
      <div class="card">
        <div class="icon">⛔</div>
        <h1>Dastur to'xtatildi</h1>
        <p>Ushbu dastur serverdan (Vercel) to'liq uzildi va ish faoliyati vaqtincha to'xtatildi.</p>
      </div>
    </body>
    </html>`,
    {
      status: 503,
      headers: { 'content-type': 'text/html; charset=utf-8' },
    }
  );
}

export const config = {
  matcher: '/((?!_next/static|_next/image|favicon.ico).*)',
};
