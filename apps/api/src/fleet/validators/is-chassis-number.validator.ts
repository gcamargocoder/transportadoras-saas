import { registerDecorator, ValidationOptions } from 'class-validator';
import { isValidChassisNumber } from '../utils/chassis.util';

export function IsChassisNumber(validationOptions?: ValidationOptions): PropertyDecorator {
  return (object: object, propertyName: string | symbol): void => {
    registerDecorator({
      name: 'isChassisNumber',
      target: object.constructor,
      propertyName: propertyName as string,
      ...(validationOptions ? { options: validationOptions } : {}),
      validator: {
        validate(value: unknown): boolean {
          return typeof value === 'string' && isValidChassisNumber(value);
        },
        defaultMessage(): string {
          return 'chassisNumber invalido. Deve conter exatamente 17 caracteres alfanumericos (VIN), sem I/O/Q.';
        },
      },
    });
  };
}
