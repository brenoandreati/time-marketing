import { Global, Module } from '@nestjs/common';
import { ENV } from '../../config/config.module';
import type { Env } from '../../config/env';
import { SecretBox } from './crypto';

@Global()
@Module({
  providers: [{ provide: SecretBox, inject: [ENV], useFactory: (env: Env) => new SecretBox(env.ENCRYPTION_KEY) }],
  exports: [SecretBox],
})
export class CryptoModule {}
