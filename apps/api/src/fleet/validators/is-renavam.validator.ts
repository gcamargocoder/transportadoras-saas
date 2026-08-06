import { registerDecorator, ValidationOptions } from 'class-validator';
import { isValidRenavam } from '../utils/renavam.util';

export function IsRenavam(validationOptions?: ValidationOptions): PropertyDecorator {
  return (object: object, propertyName: string | symbol): void => {
    registerDecorator({
      name: 'isRenavam',
      target: object.constructor,
      propertyName: propertyName as string,
      ...(validationOptions ? { options: validationOptions } : {}),
      validator: {
        validate(value: unknown): boolean {
          return typeof value === 'string' && isValidRenavam(value);
        },
        defaultMessage(): string {
          return 'renavam invalido. Deve conter entre 9 e 11 digitos numericos.';
        },
      },
    });
  };
}
