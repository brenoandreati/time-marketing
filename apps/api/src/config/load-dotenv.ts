import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

/** Carrega apps/api/.env (se existir) sem sobrescrever variáveis já definidas. */
export function loadDotenv() {
  for (const candidate of [resolve(process.cwd(), '.env'), resolve(__dirname, '../../.env')]) {
    if (existsSync(candidate)) {
      process.loadEnvFile(candidate);
      return;
    }
  }
}
