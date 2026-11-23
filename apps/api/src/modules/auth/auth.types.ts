import type { Request } from 'express';

export type AuthUser = {
  id: string;
  email: string;
  name: string;
  isPlatformAdmin: boolean;
  sessionId: string;
};

export type AuthedRequest = Request & { user?: AuthUser };

export const SESSION_COOKIE = 'cv_session';
