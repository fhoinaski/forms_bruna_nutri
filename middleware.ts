import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(request: NextRequest) {
  // Check if it's an admin path or protected API
  const isAdminPath = request.nextUrl.pathname.startsWith('/dashboard');
  const isProtectedApi = request.nextUrl.pathname.startsWith('/api/respostas') && request.method === 'GET';

  if (isAdminPath || isProtectedApi) {
    const token = request.cookies.get('admin_token');
    if (!token || token.value !== 'authenticated') {
      if (isAdminPath) {
        return NextResponse.redirect(new URL('/login', request.url));
      }
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/dashboard/:path*', '/api/respostas', '/api/respostas/:path*'],
};
