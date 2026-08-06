import { registerDecorator, ValidationOptions } from 'class-validator';

// Categorias de CNH validas no Brasil (Resolucao CONTRAN 720/2018).
export const VALID_CNH_CATEGORIES = ['A', 'B', 'C', 'D', 'E', 'AB', 'AC', 'AD', 'AE'] as const;

export function IsCnhCategory(validationOptions?: ValidationOptions): PropertyDecorator {
  return (object: object, propertyName: string | symbol): void => {
    registerDecorator({
      name: 'isCnhCategory',
      target: object.constructor,
      propertyName: propertyName as string,
      ...(validationOptions ? { options: validationOptions } : {}),
      validator: {
        validate(value: unknown): boolean {
          if (typeof value !== 'string') return false;
          return (VALID_CNH_CATEGORIES as readonly string[]).includes(value.toUpperCase());
        },
        defaultMessage(): string {
          return `categoria de CNH invalida. Valores aceitos: ${VALID_CNH_CATEGORIES.join(', ')}.`;
        },
      },
    });
  };
}
