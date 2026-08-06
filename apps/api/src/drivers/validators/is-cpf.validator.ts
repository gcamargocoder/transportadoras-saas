import { registerDecorator, ValidationOptions } from 'class-validator';
import { isValidCpf } from '../utils/cpf.util';

// Valida o CPF de verdade (digitos verificadores), nao so o formato/tamanho.
export function IsCpf(validationOptions?: ValidationOptions): PropertyDecorator {
  return (object: object, propertyName: string | symbol): void => {
    registerDecorator({
      name: 'isCpf',
      target: object.constructor,
      propertyName: propertyName as string,
      ...(validationOptions ? { options: validationOptions } : {}),
      validator: {
        validate(value: unknown): boolean {
          return typeof value === 'string' && isValidCpf(value);
        },
        defaultMessage(): string {
          return 'cpf invalido.';
        },
      },
    });
  };
}
