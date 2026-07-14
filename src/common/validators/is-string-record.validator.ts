import {
  registerDecorator,
  type ValidationArguments,
  type ValidationOptions,
} from 'class-validator';

const MAX_VALUE_LENGTH = 500;

export function IsStringRecord(validationOptions?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      name: 'isStringRecord',
      target: object.constructor,
      propertyName,
      options: validationOptions,
      validator: {
        validate(value: unknown) {
          if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
          return Object.values(value).every(
            (v) => typeof v === 'string' && v.length <= MAX_VALUE_LENGTH,
          );
        },
        defaultMessage(args: ValidationArguments) {
          return `${args.property} must be an object whose values are strings of at most ${MAX_VALUE_LENGTH} characters`;
        },
      },
    });
  };
}
