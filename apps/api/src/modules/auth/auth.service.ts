import { ConflictException, Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { hash, verify } from '@node-rs/argon2';
import { and, eq, gt, isNull, sql } from 'drizzle-orm';
import { ENV } from '../../config/config.module';
import type { Env } from '../../config/env';
import type { Database } from '../../database/client';
import { DB } from '../../database/database.module';
import { sessions, users } from '../../database/schema';
import { randomToken, sha256 } from '../../common/crypto/crypto';
import { ActivityService } from '../activity/activity.service';
import type { AuthUser } from './auth.types';

// Hash calculado uma vez e usado quando o e-mail não existe, para o tempo de resposta não revelar quais e-mails estão cadastrados.
let dummyHash: Promise<string> | undefined;
const getDummyHash = () => (dummyHash ??= hash(randomToken(16)));

export type RequestMeta = { ip?: string | null; userAgent?: string | null };

@Injectable()
export class AuthService {
  constructor(
    @Inject(DB) private readonly db: Database,
    @Inject(ENV) private readonly env: Env,
    private readonly activity: ActivityService,
  ) {}

  async signup(input: { name: string; email: string; password: string }, meta: RequestMeta) {
    const email = input.email.trim().toLowerCase();
    const existing = await this.findUserByEmail(email);
    if (existing) {
      throw new ConflictException({ code: 'email_taken', message: 'Já existe uma conta com este e-mail.', fieldErrors: { email: 'E-mail já cadastrado.' } });
    }
    const passwordHash = await hash(input.password);
    const [user] = await this.db.insert(users).values({ email, name: input.name.trim(), passwordHash }).returning();
    await this.activity.record({ actorUserId: user.id, type: 'auth.signup', message: `Conta criada para ${email}`, ip: meta.ip });
    const session = await this.createSession(user.id, meta);
    return { user: this.publicUser(user), ...session };
  }

  async login(input: { email: string; password: string }, meta: RequestMeta) {
    const email = input.email.trim().toLowerCase();
    const user = await this.findUserByEmail(email);
    const ok = await verify(user?.passwordHash ?? (await getDummyHash()), input.password).catch(() => false);
    if (!user || !ok) {
      throw new UnauthorizedException({ code: 'invalid_credentials', message: 'E-mail ou senha incorretos.' });
    }
    await this.db.update(users).set({ lastLoginAt: new Date() }).where(eq(users.id, user.id));
    await this.activity.record({ actorUserId: user.id, type: 'auth.login', message: `Login de ${email}`, ip: meta.ip });
    const session = await this.createSession(user.id, meta);
    return { user: this.publicUser(user), ...session };
  }

  async logout(sessionId: string) {
    await this.db.update(sessions).set({ revokedAt: new Date() }).where(eq(sessions.id, sessionId));
  }

  /** Resolve a sessão a partir do token do cookie. Retorna null se inválida, expirada ou revogada. */
  async resolveSession(token: string | undefined): Promise<AuthUser | null> {
    if (!token || token.length > 200) return null;
    const rows = await this.db
      .select({ sessionId: sessions.id, id: users.id, email: users.email, name: users.name, isPlatformAdmin: users.isPlatformAdmin })
      .from(sessions)
      .innerJoin(users, eq(users.id, sessions.userId))
      .where(and(eq(sessions.tokenHash, sha256(token)), isNull(sessions.revokedAt), gt(sessions.expiresAt, new Date())))
      .limit(1);
    return rows[0] ?? null;
  }

  private async createSession(userId: string, meta: RequestMeta) {
    const token = randomToken(32);
    const expiresAt = new Date(Date.now() + this.env.SESSION_TTL_DAYS * 86_400_000);
    await this.db.insert(sessions).values({
      userId,
      tokenHash: sha256(token),
      expiresAt,
      ip: meta.ip ?? null,
      userAgent: meta.userAgent?.slice(0, 300) ?? null,
    });
    return { token, expiresAt };
  }

  private async findUserByEmail(email: string) {
    const rows = await this.db.select().from(users).where(sql`lower(${users.email}) = ${email}`).limit(1);
    return rows[0];
  }

  private publicUser(u: typeof users.$inferSelect) {
    return { id: u.id, email: u.email, name: u.name, isPlatformAdmin: u.isPlatformAdmin };
  }
}
