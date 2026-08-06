import { registerDecorator, ValidationOptions } from 'class-validator';

// Cobre os dois formatos de placa brasileira com um unico regex:
// antigo (LLL-NNNN, ex: ABC1234) e Mercosul (LLLNLNN, ex: ABC1D23) --
// a 5a posicao aceita letra OU digito, as demais sao fixas.
const PLATE_PATTERN = /^[A-Z]{3}\d[A-Z0-9]\d{2}$/;

export function IsVehiclePlate(validationOptions?: ValidationOptions): PropertyDecorator {
  return (object: object, propertyName: string | symbol): void => {
    registerDecorator({
      name: 'isVehiclePlate',
      target: object.constructor,
      propertyName: propertyName as string,
      ...(validationOptions ? { options: validationOptions } : {}),
      validator: {
        validate(value: unknown): boolean {
          return (
            typeof value === 'string' &&
            PLATE_PATTERN.test(value.toUpperCase().replace(/[^A-Z0-9]/gi, ''))
          );
        },
        defaultMessage(): string {
          return 'placa invalida. Use o formato antigo (ABC1234) ou Mercosul (ABC1D23).';
        },
      },
    });
  };
}
