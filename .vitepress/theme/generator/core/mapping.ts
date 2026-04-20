import { getEffectiveObjectMode } from './memberKind'
import { toPascalCase } from './naming'
import type {
  GeneratorOptions,
  ObjectLeafMapping,
  ParsedSchemaField,
  PathAccessMode,
  SchemaNode,
} from './types'

export function getDeclaredSchemaType(node: SchemaNode | undefined): string {
  return Array.isArray(node?.type)
    ? node?.type.find((entry) => entry !== 'null') || 'unknown'
    : node?.type || 'unknown'
}

export function isStringEnumSchema(node: SchemaNode | undefined): boolean {
  return getDeclaredSchemaType(node) === 'string'
    && Array.isArray(node?.enum)
    && node.enum.length > 0
    && node.enum.every((value) => typeof value === 'string')
}

export function getEnumTypeName(path: string): string {
  const segments = path.split('/').filter(Boolean)
  const last = segments[segments.length - 1]

  if (!last) {
    return 'ValueEnum'
  }

  if (/^\d+$/.test(last)) {
    const parent = segments[segments.length - 2] || 'Item'
    return `${toPascalCase(parent)}ItemEnum`
  }

  return `${toPascalCase(last)}Enum`
}

export function schemaTypeLabel(node: SchemaNode | undefined): string {
  const declared = Array.isArray(node?.type)
    ? node.type.filter((entry) => entry !== 'null').join(' | ')
    : node?.type || 'unknown'

  if (declared === 'string' && node?.format) {
    return `${declared} (${node.format})`
  }

  return declared
}

export function mapSchemaType(node: SchemaNode | undefined, useBigDecimal: boolean): { typeName: string; imports: string[] } {
  const declared = Array.isArray(node?.type)
    ? node?.type.find((entry) => entry !== 'null')
    : node?.type

  switch (declared) {
    case 'string':
      if (node?.format === 'date') {
        return { typeName: 'LocalDate', imports: ['java.time.LocalDate'] }
      }
      if (node?.format === 'date-time') {
        return { typeName: 'OffsetDateTime', imports: ['java.time.OffsetDateTime'] }
      }
      return { typeName: 'String', imports: [] }
    case 'integer':
      return { typeName: 'Long', imports: [] }
    case 'number':
      return useBigDecimal
        ? { typeName: 'BigDecimal', imports: ['java.math.BigDecimal'] }
        : { typeName: 'Double', imports: [] }
    case 'boolean':
      return { typeName: 'Boolean', imports: [] }
    case 'array': {
      const item = mapSchemaType(node?.items, useBigDecimal)
      return {
        typeName: `List<${item.typeName}>`,
        imports: ['java.util.List', ...item.imports],
      }
    }
    case 'object':
      return { typeName: 'Map<String, Object>', imports: ['java.util.Map'] }
    default:
      return { typeName: 'Object', imports: [] }
  }
}

export function collectSchemaFields(
  node: SchemaNode | undefined,
  useBigDecimal: boolean,
  path = '',
  required = false,
): ParsedSchemaField[] {
  if (!node) {
    return []
  }

  const typeLabel = schemaTypeLabel(node)
  const mapped = mapSchemaType(node, useBigDecimal)
  const fields = [{ path, javaType: mapped.typeName, schemaType: typeLabel, required, node }]

  const declared = Array.isArray(node.type)
    ? node.type.find((entry) => entry !== 'null')
    : node.type

  if (declared === 'object' && node.properties) {
    const requiredSet = new Set(node.required || [])

    return [
      ...fields,
      ...Object.entries(node.properties).flatMap(([name, child]) =>
        collectSchemaFields(child, useBigDecimal, `${path}/${name}`, requiredSet.has(name)),
      ),
    ]
  }

  if (declared === 'array' && node.items) {
    return [
      ...fields,
      ...collectSchemaFields(node.items, useBigDecimal, `${path}/0`, false),
    ]
  }

  return fields
}

export function getPathLeafName(path: string): string {
  const segments = path.split('/').filter(Boolean)
  const last = segments[segments.length - 1] || 'Value'
  return /^\d+$/.test(last) ? `Index${last}` : last
}

export function toJsonPath(path: string): string {
  const segments = path.split('/').filter(Boolean)

  if (segments.length === 0) {
    return '$'
  }

  return segments.reduce((result, segment) => {
    if (/^\d+$/.test(segment)) {
      return `${result}[*]`
    }

    if (/^[A-Za-z_$][\w$]*$/.test(segment)) {
      return `${result}.${segment}`
    }

    return `${result}["${segment.replace(/"/g, '\\"')}"]`
  }, '$')
}

export function getObjectLeafTypeLabel(mapping: ObjectLeafMapping): string {
  switch (mapping) {
    case 'jsonObject':
      return 'JsonObject'
    case 'mapObject':
      return 'Map<String, Object>'
    case 'jojo':
      return 'JOJO'
  }
}

export function getDefaultTypeOption(node: SchemaNode | undefined, path: string, generatorOptions: GeneratorOptions): string {
  const declared = getDeclaredSchemaType(node)

  if (isStringEnumSchema(node)) {
    return generatorOptions.enumMapping === 'javaEnum'
      ? getEnumTypeName(path)
      : 'String'
  }

  switch (declared) {
    case 'string':
      if (node?.format === 'date-time') {
        return generatorOptions.dateTimeMapping === 'plainString'
          ? 'String'
          : generatorOptions.dateTimeMapping
      }
      if (node?.format === 'date') {
        return 'LocalDate'
      }
      return 'String'
    case 'integer':
      return generatorOptions.integerMapping
    case 'number':
      return generatorOptions.numberMapping
    case 'boolean':
      return generatorOptions.booleanMapping
    case 'object':
      if (node?.properties) {
        return getEffectiveObjectMode(node, generatorOptions) === 'jojo' ? 'JOJO' : 'POJO'
      }
      return getObjectLeafTypeLabel(generatorOptions.objectLeafMapping)
    default:
      return mapSchemaType(node, generatorOptions.useBigDecimal).typeName
  }
}

export function getTypeOptions(node: SchemaNode | undefined, path: string, generatorOptions: GeneratorOptions): string[] {
  const declared = getDeclaredSchemaType(node)
  const defaultOption = getDefaultTypeOption(node, path, generatorOptions)

  let optionsForType: string[]

  if (isStringEnumSchema(node)) {
    optionsForType = [getEnumTypeName(path), 'String']
  } else {
    switch (declared) {
      case 'string':
        if (node?.format === 'date-time') {
          optionsForType = ['OffsetDateTime', 'LocalDateTime', 'Instant', 'String']
        } else if (node?.format === 'date') {
          optionsForType = ['LocalDate', 'String']
        } else {
          optionsForType = ['String']
        }
        break
      case 'integer':
        optionsForType = ['int', 'Integer', 'long', 'Long', 'BigInteger']
        break
      case 'number':
        optionsForType = ['double', 'Double', 'BigDecimal', 'int', 'long']
        break
      case 'boolean':
        optionsForType = ['boolean', 'Boolean']
        break
      case 'object':
        optionsForType = node?.properties
          ? ['JOJO', 'POJO', 'JsonObject']
          : ['JsonObject', 'Map<String, Object>', 'JOJO']
        break
      default:
        optionsForType = [mapSchemaType(node, generatorOptions.useBigDecimal).typeName]
        break
    }
  }

  return Array.from(new Set([defaultOption, ...optionsForType]))
}

export function getDefaultAccessors(required: boolean, generatorOptions: GeneratorOptions): PathAccessMode[] {
  const accessors: PathAccessMode[] = []

  if (generatorOptions.accessorMode !== 'none') {
    accessors.push('getterSetter')
  }

  if (generatorOptions.pathAccessorStrategy === 'all') {
    accessors.push('pathGetterSetter')
  } else if (generatorOptions.pathAccessorStrategy === 'required' && required) {
    accessors.push('pathGetterSetter')
  }

  return accessors
}
