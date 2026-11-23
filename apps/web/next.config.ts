import type { NextConfig } from 'next';

// O frontend chama a API pelo mesmo domínio (/api/*), então o cookie de sessão é first-party
// e nenhum token chega ao JavaScript do navegador.
const API_URL = process.env.API_INTERNAL_URL ?? 'http://localhost:4000';

const config: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  devIndicators: false,
  async rewrites() {
    return [{ source: '/api/:path*', destination: `${API_URL}/:path*` }];
  },
  images: { remotePatterns: [{ protocol: 'https', hostname: '**.cdninstagram.com' }, { protocol: 'https', hostname: '**.fbcdn.net' }] },
};

export default config;
