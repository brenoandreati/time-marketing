import { eq } from 'drizzle-orm';
import { loadDotenv } from '../config/load-dotenv';
import { createDatabase, createPool } from './client';
import { users } from './schema';

/**
 * Promove um usuário existente a administrador da plataforma.
 * Uso: pnpm db:seed -- --admin=email@exemplo.com
 */
async function main() {
  loadDotenv();
  const arg = process.argv.find((a) => a.startsWith('--admin='));
  if (!arg) {
    console.log('Nada a fazer. Use --admin=email para promover um usuário a administrador da plataforma.');
    return;
  }
  const email = arg.slice('--admin='.length).toLowerCase();
  const pool = createPool(process.env.DATABASE_URL!);
  const db = createDatabase(pool);
  const rows = await db.select().from(users);
  const user = rows.find((u) => u.email.toLowerCase() === email);
  if (!user) {
    console.error(`Usuário ${email} não encontrado. Crie a conta pela tela de cadastro primeiro.`);
    process.exitCode = 1;
  } else {
    await db.update(users).set({ isPlatformAdmin: true }).where(eq(users.id, user.id));
    console.log(`${email} agora é administrador da plataforma.`);
  }
  await pool.end();
}

main();
