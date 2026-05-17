import { BadRequestException, PipeTransform } from '@nestjs/common';
import type { z } from 'zod';

export class ZodValidationPipe implements PipeTransform {
  constructor(private readonly schema: z.ZodTypeAny) {}

  transform(value: unknown) {
    const result = this.schema.safeParse(value);
    if (!result.success) {
      const message = result.error.issues
        .map((i) =>
          i.path.length > 0 ? `${i.path.join('.')}: ${i.message}` : i.message,
        )
        .join('; ');
      throw new BadRequestException(message);
    }
    return result.data;
  }
}
