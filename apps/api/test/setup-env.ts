// Ambiente isolado para os testes: banco e índice do Redis próprios, credenciais da Meta fictícias
// (as chamadas à Meta são substituídas por um fetch falso em cada teste).
process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL ?? 'postgres://app:app@localhost:5432/converso_test';
process.env.REDIS_URL = process.env.TEST_REDIS_URL ?? 'redis://localhost:6379/15';
process.env.ENCRYPTION_KEY = Buffer.alloc(32, 7).toString('base64');
process.env.WEB_URL = 'http://web.test';
process.env.API_PUBLIC_URL = 'http://api.test';
process.env.META_APP_ID = 'test-app-id';
process.env.META_APP_SECRET = 'test-app-secret';
process.env.META_WEBHOOK_VERIFY_TOKEN = 'verify-me';
process.env.META_GRAPH_VERSION = 'v24.0';
process.env.DISABLE_RATE_LIMIT = '1';
