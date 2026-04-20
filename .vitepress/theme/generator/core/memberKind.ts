import type { FieldMemberKind, FieldOverride, GeneratorOptions, SchemaNode } from './types'

export type ObjectMode = 'jojo' | 'pojo' | 'jsonObject'

function getDeclaredType(schema: SchemaNode | undefined): string {
  return Array.isArray(schema?.type)
    ? schema?.type.find((entry) => entry !== 'null') || 'unknown'
    : schema?.type || 'unknown'
}

export function allowsAdditionalProperties(schema: SchemaNode): boolean {
  return schema.additionalProperties !== false
}

export function shouldRenderAsJojo(schema: SchemaNode, generatorOptions: GeneratorOptions): boolean {
  return allowsAdditionalProperties(schema) || generatorOptions.modelingStrategy === 'jojo'
}

export function getEffectiveObjectMode(
  schema: SchemaNode,
  generatorOptions: GeneratorOptions,
  overrideJavaType?: string,
): ObjectMode {
  if (overrideJavaType === 'JsonObject') {
    return 'jsonObject'
  }

  if (overrideJavaType === 'POJO') {
    return 'pojo'
  }

  if (overrideJavaType === 'JOJO') {
    return 'jojo'
  }

  return shouldRenderAsJojo(schema, generatorOptions) ? 'jojo' : 'pojo'
}

export function shouldDisableDynamicReads(schema: SchemaNode, generatorOptions: GeneratorOptions): boolean {
  return schema.additionalProperties === false && generatorOptions.modelingStrategy === 'jojo'
}

export function getParentPath(path: string): string {
  const segments = path.split('/').filter(Boolean)
  if (segments.length <= 1) {
    return ''
  }

  return `/${segments.slice(0, -1).join('/')}`
}

export function getSchemaNodeAtPath(rootSchema: SchemaNode, path: string): SchemaNode | undefined {
  const segments = path.split('/').filter(Boolean)
  let current: SchemaNode | undefined = rootSchema

  for (const segment of segments) {
    if (!current) {
      return undefined
    }

    if (/^\d+$/.test(segment)) {
      current = current.items
      continue
    }

    if (getDeclaredType(current) !== 'object' || !current.properties) {
      return undefined
    }

    current = current.properties[segment]
  }

  return current
}

export function getDefaultMemberKind(required: boolean, ownerSchema: SchemaNode, generatorOptions: GeneratorOptions): FieldMemberKind {
  if (!shouldRenderAsJojo(ownerSchema, generatorOptions)) {
    return 'field'
  }

  switch (generatorOptions.fieldStrategy) {
    case 'required':
      return required ? 'field' : 'property'
    case 'none':
      return 'property'
    case 'all':
    default:
      return 'field'
  }
}

export function resolveMemberKind(
  required: boolean,
  ownerSchema: SchemaNode,
  generatorOptions: GeneratorOptions,
  override: FieldOverride | undefined,
  ownerOverrideJavaType?: string,
): { memberKind: FieldMemberKind; propertyAllowed: boolean } {
  const propertyAllowed = getEffectiveObjectMode(ownerSchema, generatorOptions, ownerOverrideJavaType) === 'jojo'
  const defaultMemberKind = propertyAllowed ? getDefaultMemberKind(required, ownerSchema, generatorOptions) : 'field'

  if (!propertyAllowed) {
    return {
      memberKind: 'field',
      propertyAllowed: false,
    }
  }

  return {
    memberKind: override?.memberKind || defaultMemberKind,
    propertyAllowed: true,
  }
}
