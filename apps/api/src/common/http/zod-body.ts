import { BadRequestException, createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { ZodTypeAny, z } from 'zod';

/** Valida o corpo da requisição com um schema zod e devolve erros por campo. */
export function parseBody<T extends ZodTypeAny>(schema: T, body: unknown): z.infer<T> {
  const result = schema.safeParse(body ?? {});
  if (!result.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of result.error.issues) {
      const key = issue.path.join('.') || '_';
      fieldErrors[key] ??= issue.message;
    }
    throw new BadRequestException({ code: 'validation_error', message: 'Verifique os campos informados.', fieldErrors });
  }
  return result.data;
}

export const ZodBody = createParamDecorator((schema: ZodTypeAny, ctx: ExecutionContext) => {
  const req = ctx.switchToHttp().getRequest();
  return parseBody(schema, req.body);
});
