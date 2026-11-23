import { NextRequest, NextResponse } from 'next/server';

const PUBLIC = ['/entrar', '/criar-conta'];

/** Redireciona para o login quando não há cookie de sessão. A validação real acontece na API. */
export function middleware(req: NextRequest) {
  const { pathname, search } = req.nextUrl;
  const hasSession = req.cookies.has('cv_session');
  const isPublic = PUBLIC.some((p) => pathname.startsWith(p));
  if (!hasSession && !isPublic) {
    const url = req.nextUrl.clone();
    url.pathname = '/entrar';
    url.search = pathname === '/' ? '' : `?next=${encodeURIComponent(pathname + search)}`;
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = { matcher: ['/((?!api|_next|favicon.ico|.*\\.).*)'] };
