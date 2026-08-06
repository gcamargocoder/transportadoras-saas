import { Transform } from 'class-transformer';

// `@Type(() => Boolean)` NAO funciona para query params booleanos: o
// construtor Boolean() do JS considera qualquer string nao-vazia truthy,
// entao "false" vira `true`. Este decorator interpreta "true"/"false"
// (string) corretamente antes da validacao @IsBoolean().
export function ParseBooleanQuery(): PropertyDecorator {
  return Transform(({ value }: { value: unknown }) => {
    if (typeof value !== 'string') return value;
    if (value.toLowerCase() === 'true') return true;
    if (value.toLowerCase() === 'false') return false;
    return value;
  });
}
