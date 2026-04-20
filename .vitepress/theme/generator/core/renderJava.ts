import { shouldDisableDynamicReads, shouldRenderAsJojo, resolveMemberKind } from './memberKind'
import { collectSchemaFields, getDefaultAccessors } from './mapping'
import { getDefaultTypeOption, getEnumTypeName, isStringEnumSchema, mapSchemaType } from './mapping'
import { toCamelCase, toPascalCase } from './naming'
import type { FieldOverride, GeneratorOptions, SchemaNode } from './types'

type RenderedField = {
  propertyName: string
  fieldName: string
  typeName: string
  title?: string
  description?: string
  required: boolean
  memberKind: 'field' | 'property'
}

function escapeJavaDoc(value: string): string {
  return value.replace(/\*\//g, '*\\/')
}

function getIndent(level: number): string {
  return '    '.repeat(level)
}

function getDeclaredType(schema: SchemaNode | undefined): string {
  return Array.isArray(schema?.type)
    ? schema?.type.find((entry) => entry !== 'null') || 'unknown'
    : schema?.type || 'unknown'
}

function shouldMaterializeObjectClass(schema: SchemaNode | undefined): schema is SchemaNode {
  return getDeclaredType(schema) === 'object' && !!schema?.properties
}

function resolveClassName(schema: SchemaNode | undefined, fallbackName: string): string {
  return toPascalCase(schema?.title?.trim() || fallbackName)
}

function renderJavaDocBlock(text: string, indentLevel: number): string {
  const indent = getIndent(indentLevel)
  return `${indent}/**\n${indent} * ${escapeJavaDoc(text)}\n${indent} */`
}

function getShapeLabel(node: SchemaNode | undefined): string {
  const declared = getDeclaredType(node)

  if (isStringEnumSchema(node)) {
    return `enum(${(node?.enum as string[]).join('|')})`
  }

  switch (declared) {
    case 'string':
      if (node?.format === 'date') {
        return 'string(date)'
      }
      if (node?.format === 'date-time') {
        return 'string(date-time)'
      }
      return 'string'
    case 'integer':
      return 'integer'
    case 'number':
      return 'number'
    case 'boolean':
      return 'boolean'
    case 'object':
      return 'object'
    case 'array':
      return 'array'
    default:
      return 'value'
  }
}

function buildJsonShapeModel(node: SchemaNode | undefined): unknown {
  if (!node) {
    return 'value'
  }

  if (shouldMaterializeObjectClass(node)) {
    return Object.fromEntries(
      Object.entries(node.properties || {}).map(([name, child]) => [name, buildJsonShapeModel(child)]),
    )
  }

  if (getDeclaredType(node) === 'array') {
    return [buildJsonShapeModel(node.items)]
  }

  return getShapeLabel(node)
}

function renderClassJavaDoc(schema: SchemaNode, generatorOptions: GeneratorOptions, indentLevel: number): string {
  const indent = getIndent(indentLevel)
  const classJavaDocText = generatorOptions.javaDocGeneration === 'description'
    ? schema.description
    : generatorOptions.javaDocGeneration === 'title'
      ? schema.title
      : ''

  const shapeText = JSON.stringify(buildJsonShapeModel(schema), null, 2)
  const lines = [
    ...(classJavaDocText ? classJavaDocText.split('\n') : []),
    ...(classJavaDocText ? [''] : []),
    'JSON shape:',
    '<pre>',
    ...shapeText.split('\n'),
    '</pre>',
  ]

  return `${indent}/**\n${lines.map((line) => line ? `${indent} * ${escapeJavaDoc(line)}` : `${indent} *`).join('\n')}\n${indent} */`
}

function normalizeEnumConstantName(value: string): string {
  const normalized = value
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .replace(/[^a-zA-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .replace(/_+/g, '_')
    .toUpperCase()

  if (!normalized) {
    return 'VALUE_UNKNOWN'
  }

  if (/^[0-9]/.test(normalized)) {
    return `VALUE_${normalized}`
  }

  return normalized
}

function renderEnumBlock(typeName: string, values: string[], indentLevel: number): string {
  const indent = getIndent(indentLevel)
  const memberIndent = getIndent(indentLevel + 1)
  const usedNames = new Map<string, number>()

  const constants = values.map((value) => {
    const baseName = normalizeEnumConstantName(value)
    const occurrence = usedNames.get(baseName) || 0
    usedNames.set(baseName, occurrence + 1)
    return occurrence === 0 ? baseName : `${baseName}_${occurrence + 1}`
  })

  return `${indent}public enum ${typeName} {\n${memberIndent}${constants.join(`,\n${memberIndent}`)}\n${indent}}`
}

function renderFieldAccessorBlock(fields: RenderedField[], indentLevel: number): string {
  const memberIndent = getIndent(indentLevel + 1)
  const bodyIndent = getIndent(indentLevel + 2)

  return fields.map((field) => {
    const methodName = field.fieldName.charAt(0).toUpperCase() + field.fieldName.slice(1)
    return `${memberIndent}public ${field.typeName} get${methodName}() {\n${bodyIndent}return ${field.fieldName};\n${memberIndent}}\n\n${memberIndent}public void set${methodName}(${field.typeName} ${field.fieldName}) {\n${bodyIndent}this.${field.fieldName} = ${field.fieldName};\n${memberIndent}}`
  }).join('\n\n')
}

function renderPropertyGetterBody(field: RenderedField, indentLevel: number): string {
  const bodyIndent = getIndent(indentLevel + 2)

  switch (field.typeName) {
    case 'String':
      return `${bodyIndent}return getString("${field.propertyName}");`
    case 'int':
      return `${bodyIndent}return getInt("${field.propertyName}", 0);`
    case 'Integer':
      return `${bodyIndent}return getInt("${field.propertyName}");`
    case 'long':
      return `${bodyIndent}return getLong("${field.propertyName}", 0L);`
    case 'Long':
      return `${bodyIndent}return getLong("${field.propertyName}");`
    case 'double':
      return `${bodyIndent}return getDouble("${field.propertyName}", 0d);`
    case 'Double':
      return `${bodyIndent}return getDouble("${field.propertyName}");`
    case 'boolean':
      return `${bodyIndent}return getBoolean("${field.propertyName}", false);`
    case 'Boolean':
      return `${bodyIndent}return getBoolean("${field.propertyName}");`
    case 'JsonObject':
      return `${bodyIndent}return getJsonObject("${field.propertyName}");`
    case 'Map<String, Object>':
      return `${bodyIndent}return getMap("${field.propertyName}");`
    case 'BigDecimal':
      return `${bodyIndent}return getBigDecimal("${field.propertyName}");`
    case 'BigInteger':
      return `${bodyIndent}return getBigInteger("${field.propertyName}");`
    case 'LocalDate':
      return `${bodyIndent}return get("${field.propertyName}", LocalDate.class);`
    case 'LocalDateTime':
      return `${bodyIndent}return get("${field.propertyName}", LocalDateTime.class);`
    case 'OffsetDateTime':
      return `${bodyIndent}return get("${field.propertyName}", OffsetDateTime.class);`
    case 'Instant':
      return `${bodyIndent}return get("${field.propertyName}", Instant.class);`
    default:
      if (field.typeName.startsWith('List<')) {
        const itemType = field.typeName.slice(5, -1)
        if (!itemType.includes('<') && itemType !== 'Map<String, Object>') {
          return `${bodyIndent}return getList("${field.propertyName}", ${itemType}.class);`
        }
        return `${bodyIndent}return (${field.typeName}) getList("${field.propertyName}");`
      }
      return `${bodyIndent}return get("${field.propertyName}", ${field.typeName}.class);`
  }
}

function renderPropertyAccessorBlock(fields: RenderedField[], generatorOptions: GeneratorOptions, indentLevel: number): string {
  const memberIndent = getIndent(indentLevel + 1)

  return fields.map((field) => {
    const methodName = field.fieldName.charAt(0).toUpperCase() + field.fieldName.slice(1)
    const fieldJavaDocText = generatorOptions.javaDocGeneration === 'description'
      ? field.description
      : generatorOptions.javaDocGeneration === 'title'
        ? field.title
        : ''

    const getterDoc = fieldJavaDocText
      ? `${memberIndent}/** ${escapeJavaDoc(fieldJavaDocText)} */\n`
      : ''
    const validation = generatorOptions.useValidation && field.required
      ? `${memberIndent}@NotNull\n`
      : ''

    return `${getterDoc}${validation}${memberIndent}public ${field.typeName} get${methodName}() {\n${renderPropertyGetterBody(field, indentLevel)}\n${memberIndent}}\n\n${memberIndent}public void set${methodName}(${field.typeName} ${field.fieldName}) {\n${getIndent(indentLevel + 2)}put("${field.propertyName}", ${field.fieldName});\n${memberIndent}}`
  }).join('\n\n')
}

function buildPathAccessorMethodName(path: string): string {
  return path
    .split('/')
    .filter(Boolean)
    .filter((segment) => !/^\d+$/.test(segment))
    .map((segment) => toPascalCase(segment))
    .join('')
}

function buildPathAccessorIndexParams(path: string): Array<{ name: string }> {
  const segments = path.split('/').filter(Boolean)
  const params: Array<{ name: string }> = []
  const usedNames = new Map<string, number>()

  for (let index = 0; index < segments.length; index += 1) {
    if (!/^\d+$/.test(segments[index])) {
      continue
    }

    const sourceName = toCamelCase(segments[index - 1] || 'index')
    const baseName = `${sourceName}Index`
    const occurrence = usedNames.get(baseName) || 0
    usedNames.set(baseName, occurrence + 1)
    params.push({
      name: occurrence === 0 ? baseName : `${baseName}${occurrence + 1}`,
    })
  }

  return params
}

function buildJsonPathExpression(path: string, indexParams: Array<{ name: string }>): string {
  const segments = path.split('/').filter(Boolean)
  const parts: string[] = ['"$']
  let arrayIndex = 0

  for (const segment of segments) {
    if (/^\d+$/.test(segment)) {
      parts.push(`[" + ${indexParams[arrayIndex].name} + "]`)
      arrayIndex += 1
      continue
    }

    if (/^[A-Za-z_$][\w$]*$/.test(segment)) {
      parts.push(`.${segment}`)
    } else {
      parts.push(`[\\"${segment.replace(/"/g, '\\\"')}\\"]`)
    }
  }

  parts.push('"')
  return parts.join('')
}

function getFallbackTypeNameForPath(path: string): string {
  const segments = path.split('/').filter(Boolean)
  const last = segments[segments.length - 1]

  if (!last) {
    return 'GeneratedType'
  }

  if (/^\d+$/.test(last)) {
    return toPascalCase(`${segments[segments.length - 2] || 'Item'}Item`)
  }

  return toPascalCase(last)
}

function resolveTypeNameForPath(
  node: SchemaNode | undefined,
  propertyPath: string,
  generatorOptions: GeneratorOptions,
  imports: Set<string>,
  fieldOverrides: Record<string, FieldOverride>,
): string {
  if (!node) {
    return 'Object'
  }

  if (shouldMaterializeObjectClass(node)) {
    return resolveClassName(node, getFallbackTypeNameForPath(propertyPath))
  }

  if (getDeclaredType(node) === 'array') {
    imports.add('java.util.List')
    return `List<${resolveTypeNameForPath(node.items, `${propertyPath}/0`, generatorOptions, imports, fieldOverrides)}>`
  }

  if (isStringEnumSchema(node) && generatorOptions.enumMapping === 'javaEnum') {
    return getEnumTypeName(propertyPath)
  }

  const overrideType = fieldOverrides[propertyPath]?.javaType
  if (overrideType) {
    addImportsForResolvedType(overrideType, imports)
    return overrideType
  }

  const defaultType = getDefaultTypeOption(node, propertyPath, generatorOptions)
  addImportsForResolvedType(defaultType, imports)
  if (defaultType !== mapSchemaType(node, generatorOptions.useBigDecimal).typeName || getDeclaredType(node) === 'object') {
    return defaultType
  }

  const mapped = mapSchemaType(node, generatorOptions.useBigDecimal)
  mapped.imports.forEach((entry) => imports.add(entry))
  return mapped.typeName
}

function renderPathGetterBody(typeName: string, pathExpression: string, indentLevel: number): string {
  const bodyIndent = getIndent(indentLevel + 2)

  switch (typeName) {
    case 'String':
      return `${bodyIndent}return getStringByPath(${pathExpression});`
    case 'int':
      return `${bodyIndent}return getIntByPath(${pathExpression}, 0);`
    case 'Integer':
      return `${bodyIndent}return getIntByPath(${pathExpression});`
    case 'long':
      return `${bodyIndent}return getLongByPath(${pathExpression}, 0L);`
    case 'Long':
      return `${bodyIndent}return getLongByPath(${pathExpression});`
    case 'double':
      return `${bodyIndent}return getDoubleByPath(${pathExpression}, 0d);`
    case 'Double':
      return `${bodyIndent}return getDoubleByPath(${pathExpression});`
    case 'boolean':
      return `${bodyIndent}return getBooleanByPath(${pathExpression}, false);`
    case 'Boolean':
      return `${bodyIndent}return getBooleanByPath(${pathExpression});`
    case 'BigInteger':
      return `${bodyIndent}return getBigIntegerByPath(${pathExpression});`
    case 'BigDecimal':
      return `${bodyIndent}return getBigDecimalByPath(${pathExpression});`
    case 'JsonObject':
      return `${bodyIndent}return getJsonObjectByPath(${pathExpression});`
    case 'Map<String, Object>':
      return `${bodyIndent}return getMapByPath(${pathExpression});`
    case 'LocalDate':
      return `${bodyIndent}return getByPath(${pathExpression}, LocalDate.class);`
    case 'LocalDateTime':
      return `${bodyIndent}return getByPath(${pathExpression}, LocalDateTime.class);`
    case 'OffsetDateTime':
      return `${bodyIndent}return getByPath(${pathExpression}, OffsetDateTime.class);`
    case 'Instant':
      return `${bodyIndent}return getByPath(${pathExpression}, Instant.class);`
    default:
      if (typeName.startsWith('List<')) {
        const itemType = typeName.slice(5, -1)
        if (!itemType.includes('<') && itemType !== 'Map<String, Object>') {
          return `${bodyIndent}return getListByPath(${pathExpression}, ${itemType}.class);`
        }
        return `${bodyIndent}return (${typeName}) getListByPath(${pathExpression});`
      }
      return `${bodyIndent}return getByPath(${pathExpression}, ${typeName}.class);`
  }
}

function renderPathAccessorBlock(
  rootSchema: SchemaNode,
  generatorOptions: GeneratorOptions,
  imports: Set<string>,
  fieldOverrides: Record<string, FieldOverride>,
  indentLevel: number,
): string {
  if (!shouldRenderAsJojo(rootSchema, generatorOptions)) {
    return ''
  }

  const fields = collectSchemaFields(rootSchema, generatorOptions.useBigDecimal)
    .filter((field) => field.path)
    .filter((field) => field.path.split('/').filter(Boolean).length > 1)
    .filter((field) => {
      const accessors = fieldOverrides[field.path]?.pathAccessors || getDefaultAccessors(field.required, generatorOptions)
      return accessors.includes('pathGetterSetter')
    })

  if (fields.length === 0) {
    return ''
  }

  const memberIndent = getIndent(indentLevel + 1)

  return fields.map((field) => {
    const typeName = resolveTypeNameForPath(field.node, field.path, generatorOptions, imports, fieldOverrides)
    const methodSuffix = buildPathAccessorMethodName(field.path)
    const indexParams = buildPathAccessorIndexParams(field.path)
    const pathExpression = buildJsonPathExpression(field.path, indexParams)
    const getterParams = indexParams.map((param) => `int ${param.name}`).join(', ')
    const setterParams = [...indexParams.map((param) => `int ${param.name}`), `${typeName} value`].join(', ')
    const getterSignature = `${memberIndent}public ${typeName} get${methodSuffix}(${getterParams}) {`
    const setterSignature = `${memberIndent}public void set${methodSuffix}(${setterParams}) {`

    return `${getterSignature}\n${renderPathGetterBody(typeName, pathExpression, indentLevel)}\n${memberIndent}}\n\n${setterSignature}\n${getIndent(indentLevel + 2)}putByPath(${pathExpression}, value);\n${memberIndent}}`
  }).join('\n\n')
}

function addImportsForResolvedType(typeName: string, imports: Set<string>) {
  if (typeName.startsWith('List<') && typeName.endsWith('>')) {
    imports.add('java.util.List')
    addImportsForResolvedType(typeName.slice(5, -1), imports)
    return
  }

  if (typeName === 'Map<String, Object>') {
    imports.add('java.util.Map')
    return
  }

  switch (typeName) {
    case 'BigDecimal':
      imports.add('java.math.BigDecimal')
      return
    case 'BigInteger':
      imports.add('java.math.BigInteger')
      return
    case 'JsonObject':
      imports.add('org.sjf4j.JsonObject')
      return
    case 'LocalDate':
      imports.add('java.time.LocalDate')
      return
    case 'OffsetDateTime':
      imports.add('java.time.OffsetDateTime')
      return
    case 'LocalDateTime':
      imports.add('java.time.LocalDateTime')
      return
    case 'Instant':
      imports.add('java.time.Instant')
      return
    default:
      return
  }
}

function resolveFieldType(
  node: SchemaNode | undefined,
  fallbackName: string,
  generatorOptions: GeneratorOptions,
  imports: Set<string>,
  nestedClassBlocks: string[],
  fieldOverrides: Record<string, FieldOverride>,
  propertyPath: string,
  indentLevel: number,
): string {
  if (!node) {
    return 'Object'
  }

  if (shouldMaterializeObjectClass(node)) {
    const className = resolveClassName(node, fallbackName)
    nestedClassBlocks.push(renderClass(node, className, generatorOptions, imports, fieldOverrides, propertyPath, indentLevel, false))
    return className
  }

  if (getDeclaredType(node) === 'array') {
    imports.add('java.util.List')
    return `List<${resolveFieldType(node.items, `${fallbackName}Item`, generatorOptions, imports, nestedClassBlocks, fieldOverrides, `${propertyPath}/0`, indentLevel)}>`
  }

  if (isStringEnumSchema(node) && generatorOptions.enumMapping === 'javaEnum') {
    return getEnumTypeName(propertyPath)
  }

  const overrideType = fieldOverrides[propertyPath]?.javaType
  if (overrideType) {
    addImportsForResolvedType(overrideType, imports)
    return overrideType
  }

  const defaultType = getDefaultTypeOption(node, propertyPath, generatorOptions)
  addImportsForResolvedType(defaultType, imports)
  if (defaultType !== mapSchemaType(node, generatorOptions.useBigDecimal).typeName || getDeclaredType(node) === 'object') {
    return defaultType
  }

  const mapped = mapSchemaType(node, generatorOptions.useBigDecimal)
  mapped.imports.forEach((entry) => imports.add(entry))
  return mapped.typeName
}

function renderClass(
  schema: SchemaNode,
  className: string,
  generatorOptions: GeneratorOptions,
  imports: Set<string>,
  fieldOverrides: Record<string, FieldOverride>,
  objectPath: string,
  indentLevel: number,
  isRoot: boolean,
): string {
  const indent = getIndent(indentLevel)
  const memberIndent = getIndent(indentLevel + 1)
  const properties = schema.properties || {}
  const required = new Set(schema.required || [])
  const nestedClassBlocks: string[] = []
  const nestedEnumBlocks: string[] = []

  if (generatorOptions.accessorMode === 'lombok') {
    imports.add('lombok.Data')
    if (shouldRenderAsJojo(schema, generatorOptions)) {
      imports.add('lombok.EqualsAndHashCode')
    }
  }

  if (shouldRenderAsJojo(schema, generatorOptions)) {
    imports.add('org.sjf4j.JsonObject')
  }

  if (shouldDisableDynamicReads(schema, generatorOptions)) {
    imports.add('org.sjf4j.annotation.NodeBinding')
  }

  const renderedFields = Object.entries(properties).map(([propertyName, propertySchema]) => {
    const propertyPath = `${objectPath}/${propertyName}`
    const fieldName = toCamelCase(propertyName)

    if (isStringEnumSchema(propertySchema) && generatorOptions.enumMapping === 'javaEnum' && fieldOverrides[propertyPath]?.javaType !== 'String') {
      nestedEnumBlocks.push(renderEnumBlock(getEnumTypeName(propertyPath), propertySchema.enum as string[], indentLevel + 1))
    }

    if (
      getDeclaredType(propertySchema) === 'array'
      && isStringEnumSchema(propertySchema.items)
      && generatorOptions.enumMapping === 'javaEnum'
      && fieldOverrides[`${propertyPath}/0`]?.javaType !== 'String'
    ) {
      nestedEnumBlocks.push(renderEnumBlock(getEnumTypeName(`${propertyPath}/0`), propertySchema.items.enum as string[], indentLevel + 1))
    }

    const resolvedType = resolveFieldType(
      propertySchema,
      toPascalCase(propertyName),
      generatorOptions,
      imports,
      nestedClassBlocks,
      fieldOverrides,
      propertyPath,
      indentLevel + 1,
    )

    const memberConfig = resolveMemberKind(required.has(propertyName), schema, generatorOptions, fieldOverrides[propertyPath])

    if (generatorOptions.useValidation && required.has(propertyName)) {
      imports.add(`${generatorOptions.validationNamespace}.validation.constraints.NotNull`)
    }

    return {
      propertyName,
      fieldName,
      typeName: resolvedType,
      title: propertySchema.title,
      description: propertySchema.description,
      required: required.has(propertyName),
      memberKind: memberConfig.memberKind,
    } satisfies RenderedField
  })

  const classDocs = renderClassJavaDoc(schema, generatorOptions, indentLevel)
  const annotationLines = [
    shouldDisableDynamicReads(schema, generatorOptions) ? `${indent}@NodeBinding(readDynamic = false)` : '',
    generatorOptions.accessorMode === 'lombok' ? `${indent}@Data` : '',
    generatorOptions.accessorMode === 'lombok' && shouldRenderAsJojo(schema, generatorOptions)
      ? `${indent}@EqualsAndHashCode(callSuper = true)`
      : '',
  ].filter(Boolean).join('\n')

  const classHeader = `${indent}${isRoot ? 'public' : 'public static'} class ${className}${shouldRenderAsJojo(schema, generatorOptions) ? ' extends JsonObject' : ''} {`

  const fieldMembers = renderedFields
    .filter((field) => field.memberKind === 'field')
    .map((field) => {
      const fieldJavaDocText = generatorOptions.javaDocGeneration === 'description'
        ? field.description
        : generatorOptions.javaDocGeneration === 'title'
          ? field.title
          : ''

      const javaDoc = fieldJavaDocText
        ? `${memberIndent}/** ${escapeJavaDoc(fieldJavaDocText)} */\n`
        : ''
      const validation = generatorOptions.useValidation && field.required
        ? `${memberIndent}@NotNull\n`
        : ''

      return `${javaDoc}${validation}${memberIndent}private ${field.typeName} ${field.fieldName};`
    })
    .join('\n\n')

  const fieldAccessorBlock = generatorOptions.accessorMode === 'methods'
    ? renderFieldAccessorBlock(renderedFields.filter((field) => field.memberKind === 'field'), indentLevel)
    : ''

  const propertyAccessorBlock = renderPropertyAccessorBlock(
    renderedFields.filter((field) => field.memberKind === 'property'),
    generatorOptions,
    indentLevel,
  )

  const pathAccessorBlock = isRoot
    ? renderPathAccessorBlock(schema, generatorOptions, imports, fieldOverrides, indentLevel)
    : ''

  const memberSections = [fieldMembers, fieldAccessorBlock, propertyAccessorBlock, pathAccessorBlock, nestedEnumBlocks.join('\n\n'), nestedClassBlocks.join('\n\n')]
    .filter(Boolean)

  if (memberSections.length === 0) {
    memberSections.push(`${memberIndent}// TODO: map schema properties into Java fields.`)
  }

  return [classDocs, annotationLines, classHeader, memberSections.join('\n\n'), `${indent}}`]
    .filter(Boolean)
    .join('\n')
}

export function renderJava(
  schema: SchemaNode,
  generatorOptions: GeneratorOptions,
  fieldOverrides: Record<string, FieldOverride> = {},
): string {
  const normalizedClassName = generatorOptions.className.trim()
    ? toPascalCase(generatorOptions.className)
    : toPascalCase(schema.title || 'GeneratedType')

  const imports = new Set<string>()
  const renderedClass = renderClass(schema, normalizedClassName, generatorOptions, imports, fieldOverrides, '', 0, true)
  const packageLine = generatorOptions.packageName.trim()
    ? `package ${generatorOptions.packageName.trim()};\n\n`
    : ''

  const renderedImports = Array.from(imports)
    .sort((left, right) => left.localeCompare(right))
    .map((entry) => `import ${entry};`)
    .join('\n')

  return `${packageLine}${renderedImports ? `${renderedImports}\n\n` : ''}${renderedClass}\n`
}
