import type { GeneratorOptions, PathAccessMode, ValidationAnnotation } from './types'

export const validationAnnotationOptions: ValidationAnnotation[] = ['@NotNull', '@Size', '@Min', '@Max', '@Pattern']

export const pathAccessModeOptions: Array<{ value: PathAccessMode; label: string }> = [
  { value: 'getterSetter', label: 'Getter/Setter' },
  { value: 'pathGetterSetter', label: 'Path getter/setter' },
]

export function createDefaultGeneratorOptions(): GeneratorOptions {
  return {
    packageName: 'org.example.generated',
    className: '',
    booleanMapping: 'boolean',
    dateTimeMapping: 'OffsetDateTime',
    enumMapping: 'javaEnum',
    integerMapping: 'int',
    modelingStrategy: 'jojo',
    numberMapping: 'double',
    objectLeafMapping: 'jsonObject',
    fieldStrategy: 'all',
    accessorMode: 'lombok',
    pathAccessorStrategy: 'required',
    useValidation: true,
    validationAnnotations: [...validationAnnotationOptions],
    validationNamespace: 'jakarta',
    javaDocGeneration: 'description',
    useBigDecimal: true,
  }
}
