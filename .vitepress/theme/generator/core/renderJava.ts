import { getEffectiveObjectMode, isPathOnlyMode, resolveMemberKind, shouldDisableDynamicReads } from './memberKind'
import { collectSchemaFields, getDefaultAccessors } from './mapping'
import { getDefaultTypeOption, getEnumTypeName, isStringEnumSchema, mapSchemaType } from './mapping'
import { toCamelCase, toPascalCase } from './naming'
import type { FieldOverride, GeneratorOptions, SchemaNode } from './types'

type RenderedField = {
  propertyName: string
  fieldName: string
  typeName: string
  node: SchemaNode
  title?: string
  description?: string
  required: boolean
  memberKind: 'field' | 'property'
}

function usesValidationAnnotation(generatorOptions: GeneratorOptions, annotation: '@NotNull' | '@Size' | '@Min' | '@Max' | '@Pattern'): boolean {
  return generatorOptions.useValidation && generatorOptions.validationAnnotations.includes(annotation)
}

function escapeJavaString(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
}

function isIntegralConstraintValue(value: number | undefined): value is number {
  return typeof value === 'number' && Number.isInteger(value)
}

function buildValidationAnnotations(
  node: SchemaNode,
  required: boolean,
  generatorOptions: GeneratorOptions,
  imports: Set<string>,
  indent: string,
): string {
  const annotations: string[] = []

  if (usesValidationAnnotation(generatorOptions, '@NotNull') && required) {
    imports.add(`${generatorOptions.validationNamespace}.validation.constraints.NotNull`)
    annotations.push(`${indent}@NotNull`)
  }

  if (usesValidationAnnotation(generatorOptions, '@Size')) {
    const sizeParts: string[] = []
    const min = typeof node.minLength === 'number' ? node.minLength : typeof node.minItems === 'number' ? node.minItems : undefined
    const max = typeof node.maxLength === 'number' ? node.maxLength : typeof node.maxItems === 'number' ? node.maxItems : undefined

    if (typeof min === 'number') {
      sizeParts.push(`min = ${min}`)
    }
    if (typeof max === 'number') {
      sizeParts.push(`max = ${max}`)
    }

    if (sizeParts.length > 0) {
      imports.add(`${generatorOptions.validationNamespace}.validation.constraints.Size`)
      annotations.push(`${indent}@Size(${sizeParts.join(', ')})`)
    }
  }

  if (usesValidationAnnotation(generatorOptions, '@Pattern') && typeof node.pattern === 'string' && node.pattern.length > 0) {
    imports.add(`${generatorOptions.validationNamespace}.validation.constraints.Pattern`)
    annotations.push(`${indent}@Pattern(regexp = "${escapeJavaString(node.pattern)}")`)
  }

  if (usesValidationAnnotation(generatorOptions, '@Min') && isIntegralConstraintValue(node.minimum)) {
    imports.add(`${generatorOptions.validationNamespace}.validation.constraints.Min`)
    annotations.push(`${indent}@Min(${node.minimum})`)
  }

  if (usesValidationAnnotation(generatorOptions, '@Max') && isIntegralConstraintValue(node.maximum)) {
    imports.add(`${generatorOptions.validationNamespace}.validation.constraints.Max`)
    annotations.push(`${indent}@Max(${node.maximum})`)
  }

  return annotations.length > 0 ? `${annotations.join('\n')}\n` : ''
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

function resolveJavaDocText(
  generatorOptions: GeneratorOptions,
  title: string | undefined,
  description: string | undefined,
): string {
  switch (generatorOptions.javaDocGeneration) {
    case 'description':
      return description || ''
    case 'title':
      return title || ''
    default:
      return ''
  }
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

function renderClassJavaDoc(schema: SchemaNode, generatorOptions: GeneratorOptions, indentLevel: number, includeShape: boolean): string {
  const classJavaDocText = generatorOptions.javaDocGeneration === 'description'
    ? schema.description
    : generatorOptions.javaDocGeneration === 'title'
      ? schema.title
      : ''

  if (!includeShape) {
    return classJavaDocText ? renderJavaDocBlock(classJavaDocText, indentLevel) : ''
  }

  const indent = getIndent(indentLevel)

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

function getObjectModeForSchema(schema: SchemaNode, generatorOptions: GeneratorOptions, overrideJavaType?: string) {
  return getEffectiveObjectMode(schema, generatorOptions, overrideJavaType)
}

function shouldRenderObjectAsJojo(schema: SchemaNode, generatorOptions: GeneratorOptions, overrideJavaType?: string): boolean {
  return getObjectModeForSchema(schema, generatorOptions, overrideJavaType) === 'jojo'
}

function shouldDisableDynamicReadsForObject(schema: SchemaNode, generatorOptions: GeneratorOptions, overrideJavaType?: string): boolean {
  return getObjectModeForSchema(schema, generatorOptions, overrideJavaType) === 'jojo'
    && shouldDisableDynamicReads(schema, generatorOptions)
}

function isRootDirectPath(path: string): boolean {
  return path.split('/').filter(Boolean).length === 1
}

function shouldUseFlattenedEnumName(path: string, generatorOptions: GeneratorOptions): boolean {
  return isPathOnlyMode(generatorOptions) && !isRootDirectPath(path)
}

function getResolvedEnumTypeName(path: string, generatorOptions: GeneratorOptions): string {
  return getEnumTypeName(path, shouldUseFlattenedEnumName(path, generatorOptions))
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

function buildGetterMethodName(typeName: string, methodSuffix: string): string {
  return `${typeName === 'boolean' ? 'is' : 'get'}${methodSuffix}`
}

function renderFieldAccessorBlock(fields: RenderedField[], indentLevel: number): string {
  const memberIndent = getIndent(indentLevel + 1)
  const bodyIndent = getIndent(indentLevel + 2)

  return fields.map((field) => {
    const methodName = field.fieldName.charAt(0).toUpperCase() + field.fieldName.slice(1)
    const getterName = buildGetterMethodName(field.typeName, methodName)
    return `${memberIndent}public ${field.typeName} ${getterName}() {\n${bodyIndent}return ${field.fieldName};\n${memberIndent}}\n\n${memberIndent}public void set${methodName}(${field.typeName} ${field.fieldName}) {\n${bodyIndent}this.${field.fieldName} = ${field.fieldName};\n${memberIndent}}`
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

function renderPropertyAccessorBlock(
  fields: RenderedField[],
  generatorOptions: GeneratorOptions,
  imports: Set<string>,
  indentLevel: number,
): string {
  const memberIndent = getIndent(indentLevel + 1)

  return fields.map((field) => {
    const methodName = field.fieldName.charAt(0).toUpperCase() + field.fieldName.slice(1)
    const getterName = buildGetterMethodName(field.typeName, methodName)
    const fieldJavaDocText = resolveJavaDocText(generatorOptions, field.title, field.description)

    const getterDoc = fieldJavaDocText
      ? `${memberIndent}/** ${escapeJavaDoc(fieldJavaDocText)} */\n`
      : ''
    const validation = buildValidationAnnotations(field.node, field.required, generatorOptions, imports, memberIndent)

    return `${getterDoc}${validation}${memberIndent}public ${field.typeName} ${getterName}() {\n${renderPropertyGetterBody(field, indentLevel)}\n${memberIndent}}\n\n${memberIndent}public void set${methodName}(${field.typeName} ${field.fieldName}) {\n${getIndent(indentLevel + 2)}put("${field.propertyName}", ${field.fieldName});\n${memberIndent}}`
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

function buildJsonPathLiteral(path: string): string {
  return JSON.stringify(buildJsonPathExpression(path, []).slice(1, -1))
}

function buildPathConstantName(path: string): string {
  return `PATH_${path
    .split('/')
    .filter(Boolean)
    .map((segment) => (/^\d+$/.test(segment) ? 'INDEX' : normalizeEnumConstantName(segment)))
    .join('_')}`
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
    if (isPathOnlyMode(generatorOptions) && propertyPath) {
      addImportsForResolvedType('JsonObject', imports)
      return 'JsonObject'
    }

    const objectMode = getObjectModeForSchema(node, generatorOptions, fieldOverrides[propertyPath]?.javaType)
    if (objectMode === 'jsonObject') {
      addImportsForResolvedType('JsonObject', imports)
      return 'JsonObject'
    }

    return resolveClassName(node, getFallbackTypeNameForPath(propertyPath))
  }

  if (getDeclaredType(node) === 'array') {
    imports.add('java.util.List')
    return `List<${resolveTypeNameForPath(node.items, `${propertyPath}/0`, generatorOptions, imports, fieldOverrides)}>`
  }

  if (isStringEnumSchema(node) && generatorOptions.enumMapping === 'javaEnum') {
    return getResolvedEnumTypeName(propertyPath, generatorOptions)
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
): { constants: string; methods: string } {
  if (!shouldRenderObjectAsJojo(rootSchema, generatorOptions)) {
    return { constants: '', methods: '' }
  }

  const fields = collectSchemaFields(rootSchema, generatorOptions.useBigDecimal)
    .filter((field) => field.path)
    .filter((field) => field.path.split('/').filter(Boolean).length > 1)
    .filter((field) => {
      const accessors = fieldOverrides[field.path]?.pathAccessors || getDefaultAccessors(field.required, generatorOptions)
      return accessors.includes('pathGetterSetter')
    })

  if (fields.length === 0) {
    return { constants: '', methods: '' }
  }

  const memberIndent = getIndent(indentLevel + 1)
  const pathConstantLines: string[] = []

  const methods = fields.map((field) => {
    const typeName = resolveTypeNameForPath(field.node, field.path, generatorOptions, imports, fieldOverrides)
    const methodSuffix = buildPathAccessorMethodName(field.path)
    const getterName = buildGetterMethodName(typeName, methodSuffix)
    const fieldJavaDocText = resolveJavaDocText(generatorOptions, field.node?.title, field.node?.description)
    const getterDoc = isPathOnlyMode(generatorOptions) && fieldJavaDocText
      ? `${memberIndent}/** ${escapeJavaDoc(fieldJavaDocText)} */\n`
      : ''
    const indexParams = buildPathAccessorIndexParams(field.path)
    const usesConstantPath = indexParams.length === 0
    const pathExpression = buildJsonPathExpression(field.path, indexParams)
    const pathReference = usesConstantPath ? buildPathConstantName(field.path) : pathExpression
    const getterParams = indexParams.map((param) => `int ${param.name}`).join(', ')
    const setterParams = [...indexParams.map((param) => `int ${param.name}`), `${typeName} value`].join(', ')
    const getterSignature = `${memberIndent}public ${typeName} ${getterName}(${getterParams}) {`
    const setterSignature = `${memberIndent}public void set${methodSuffix}(${setterParams}) {`

    if (usesConstantPath) {
      imports.add('org.sjf4j.path.JsonPath')
      pathConstantLines.push(`${memberIndent}private static final JsonPath ${pathReference} = JsonPath.parse(${buildJsonPathLiteral(field.path)});`)
    }

    const getterBody = usesConstantPath
      ? renderCompiledPathGetterBody(typeName, pathReference, indentLevel)
      : renderPathGetterBody(typeName, pathExpression, indentLevel)
    const setterBody = usesConstantPath
      ? `${getIndent(indentLevel + 2)}${pathReference}.ensurePut(this, value);`
      : `${getIndent(indentLevel + 2)}ensurePutByPath(${pathExpression}, value);`

    return `${getterDoc}${getterSignature}\n${getterBody}\n${memberIndent}}\n\n${setterSignature}\n${setterBody}\n${memberIndent}}`
  }).join('\n\n')

  return {
    constants: pathConstantLines.join('\n'),
    methods,
  }
}

function renderCompiledPathGetterBody(typeName: string, pathReference: string, indentLevel: number): string {
  const bodyIndent = getIndent(indentLevel + 2)

  switch (typeName) {
    case 'String':
      return `${bodyIndent}return ${pathReference}.getString(this);`
    case 'int':
      return `${bodyIndent}return ${pathReference}.getInt(this, 0);`
    case 'Integer':
      return `${bodyIndent}return ${pathReference}.getInt(this);`
    case 'long':
      return `${bodyIndent}return ${pathReference}.getLong(this, 0L);`
    case 'Long':
      return `${bodyIndent}return ${pathReference}.getLong(this);`
    case 'double':
      return `${bodyIndent}return ${pathReference}.getDouble(this, 0d);`
    case 'Double':
      return `${bodyIndent}return ${pathReference}.getDouble(this);`
    case 'boolean':
      return `${bodyIndent}return ${pathReference}.getBoolean(this, false);`
    case 'Boolean':
      return `${bodyIndent}return ${pathReference}.getBoolean(this);`
    case 'BigInteger':
      return `${bodyIndent}return ${pathReference}.getBigInteger(this);`
    case 'BigDecimal':
      return `${bodyIndent}return ${pathReference}.getBigDecimal(this);`
    case 'JsonObject':
      return `${bodyIndent}return ${pathReference}.getJsonObject(this);`
    case 'Map<String, Object>':
      return `${bodyIndent}return ${pathReference}.getMap(this);`
    case 'LocalDate':
      return `${bodyIndent}return ${pathReference}.get(this, LocalDate.class);`
    case 'LocalDateTime':
      return `${bodyIndent}return ${pathReference}.get(this, LocalDateTime.class);`
    case 'OffsetDateTime':
      return `${bodyIndent}return ${pathReference}.get(this, OffsetDateTime.class);`
    case 'Instant':
      return `${bodyIndent}return ${pathReference}.get(this, Instant.class);`
    default:
      if (typeName.startsWith('List<')) {
        const itemType = typeName.slice(5, -1)
        if (!itemType.includes('<') && itemType !== 'Map<String, Object>') {
          return `${bodyIndent}return ${pathReference}.getList(this, ${itemType}.class);`
        }
        return `${bodyIndent}return (${typeName}) ${pathReference}.getList(this);`
      }
      return `${bodyIndent}return ${pathReference}.get(this, ${typeName}.class);`
  }
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
    if (isPathOnlyMode(generatorOptions) && propertyPath) {
      addImportsForResolvedType('JsonObject', imports)
      return 'JsonObject'
    }

    const objectMode = getObjectModeForSchema(node, generatorOptions, fieldOverrides[propertyPath]?.javaType)
    if (objectMode === 'jsonObject') {
      addImportsForResolvedType('JsonObject', imports)
      return 'JsonObject'
    }

    const className = resolveClassName(node, fallbackName)
    nestedClassBlocks.push(renderClass(node, className, generatorOptions, imports, fieldOverrides, propertyPath, indentLevel, false, objectMode))
    return className
  }

  if (getDeclaredType(node) === 'array') {
    imports.add('java.util.List')
    return `List<${resolveFieldType(node.items, `${fallbackName}Item`, generatorOptions, imports, nestedClassBlocks, fieldOverrides, `${propertyPath}/0`, indentLevel)}>`
  }

  if (isStringEnumSchema(node) && generatorOptions.enumMapping === 'javaEnum') {
    return getResolvedEnumTypeName(propertyPath, generatorOptions)
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
  objectModeOverride?: 'jojo' | 'pojo',
): string {
  const indent = getIndent(indentLevel)
  const memberIndent = getIndent(indentLevel + 1)
  const properties = schema.properties || {}
  const required = new Set(schema.required || [])
  const nestedClassBlocks: string[] = []
  const nestedEnumBlocks: string[] = []
  const objectMode = objectModeOverride || getObjectModeForSchema(schema, generatorOptions, objectPath ? fieldOverrides[objectPath]?.javaType : undefined)
  const rendersAsJojo = objectMode === 'jojo'
  const disablesDynamicReads = shouldDisableDynamicReadsForObject(schema, generatorOptions, objectMode === 'jojo' ? 'JOJO' : 'POJO')
  const pathOnly = isPathOnlyMode(generatorOptions)

  if (generatorOptions.accessorMode === 'lombok') {
    if (rendersAsJojo) {
      imports.add('lombok.Getter')
      imports.add('lombok.Setter')
    } else {
      imports.add('lombok.Data')
    }
  }

  if (rendersAsJojo) {
    imports.add('org.sjf4j.JsonObject')
  }

  if (disablesDynamicReads) {
    imports.add('org.sjf4j.annotation.NodeBinding')
  }

  const renderedFields = Object.entries(properties).map(([propertyName, propertySchema]) => {
    const propertyPath = `${objectPath}/${propertyName}`
    const fieldName = toCamelCase(propertyName)

    if (isStringEnumSchema(propertySchema) && generatorOptions.enumMapping === 'javaEnum' && fieldOverrides[propertyPath]?.javaType !== 'String') {
      nestedEnumBlocks.push(renderEnumBlock(getResolvedEnumTypeName(propertyPath, generatorOptions), propertySchema.enum as string[], indentLevel + 1))
    }

    if (
      getDeclaredType(propertySchema) === 'array'
      && isStringEnumSchema(propertySchema.items)
      && generatorOptions.enumMapping === 'javaEnum'
      && fieldOverrides[`${propertyPath}/0`]?.javaType !== 'String'
    ) {
      nestedEnumBlocks.push(renderEnumBlock(getResolvedEnumTypeName(`${propertyPath}/0`, generatorOptions), propertySchema.items.enum as string[], indentLevel + 1))
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

    const memberConfig = resolveMemberKind(required.has(propertyName), schema, generatorOptions, fieldOverrides[propertyPath], objectMode === 'jojo' ? 'JOJO' : 'POJO')

    return {
      propertyName,
      fieldName,
      typeName: resolvedType,
      node: propertySchema,
      title: propertySchema.title,
      description: propertySchema.description,
      required: required.has(propertyName),
      memberKind: memberConfig.memberKind,
    } satisfies RenderedField
  })

  const classDocs = renderClassJavaDoc(schema, generatorOptions, indentLevel, isRoot)
  const annotationLines = [
    disablesDynamicReads ? `${indent}@NodeBinding(readDynamic = false)` : '',
    generatorOptions.accessorMode === 'lombok' && rendersAsJojo ? `${indent}@Getter @Setter` : '',
    generatorOptions.accessorMode === 'lombok' && !rendersAsJojo ? `${indent}@Data` : '',
  ].filter(Boolean).join('\n')

  const classHeader = `${indent}${isRoot ? 'public' : 'public static'} class ${className}${rendersAsJojo ? ' extends JsonObject' : ''} {`

  const fieldMembers = renderedFields
    .filter((field) => field.memberKind === 'field')
    .map((field) => {
      const fieldJavaDocText = resolveJavaDocText(generatorOptions, field.title, field.description)

      const javaDoc = fieldJavaDocText
        ? `${memberIndent}/** ${escapeJavaDoc(fieldJavaDocText)} */\n`
        : ''
      const validation = buildValidationAnnotations(field.node, field.required, generatorOptions, imports, memberIndent)

      return `${javaDoc}${validation}${memberIndent}private ${field.typeName} ${field.fieldName};`
    })
    .join('\n\n')

  const fieldAccessorBlock = generatorOptions.accessorMode === 'methods'
    ? renderFieldAccessorBlock(renderedFields.filter((field) => field.memberKind === 'field'), indentLevel)
    : ''

  const propertyAccessorBlock = renderPropertyAccessorBlock(
    renderedFields.filter((field) => field.memberKind === 'property'),
    generatorOptions,
    imports,
    indentLevel,
  )

  const pathAccessorBlock = isRoot
    ? renderPathAccessorBlock(schema, generatorOptions, imports, fieldOverrides, indentLevel)
    : { constants: '', methods: '' }

  const hoistedPathOnlyEnumBlocks = isRoot && pathOnly
    ? collectHoistedPathOnlyEnumBlocks(schema, generatorOptions, fieldOverrides, indentLevel + 1)
    : []

  const memberSections = [fieldMembers, fieldAccessorBlock, propertyAccessorBlock, pathAccessorBlock.constants, pathAccessorBlock.methods, nestedEnumBlocks.join('\n\n'), hoistedPathOnlyEnumBlocks.join('\n\n'), nestedClassBlocks.join('\n\n')]
    .filter(Boolean)

  if (memberSections.length === 0) {
    memberSections.push(`${memberIndent}// TODO: map schema properties into Java fields.`)
  }

  return [classDocs, annotationLines, classHeader, memberSections.join('\n\n'), `${indent}}`]
    .filter(Boolean)
    .join('\n')
}

function collectHoistedPathOnlyEnumBlocks(
  schema: SchemaNode,
  generatorOptions: GeneratorOptions,
  fieldOverrides: Record<string, FieldOverride>,
  indentLevel: number,
): string[] {
  if (!isPathOnlyMode(generatorOptions) || generatorOptions.enumMapping !== 'javaEnum') {
    return []
  }

  const enumBlocks: string[] = []
  const emittedNames = new Set<string>()

  function visit(node: SchemaNode | undefined, path: string) {
    if (!node) {
      return
    }

    const depth = path.split('/').filter(Boolean).length

    if (isStringEnumSchema(node) && depth > 1 && fieldOverrides[path]?.javaType !== 'String') {
      const typeName = getResolvedEnumTypeName(path, generatorOptions)
      if (!emittedNames.has(typeName)) {
        emittedNames.add(typeName)
        enumBlocks.push(renderEnumBlock(typeName, node.enum as string[], indentLevel))
      }
    }

    if (getDeclaredType(node) === 'array') {
      const itemPath = path ? `${path}/0` : '/0'
      if (isStringEnumSchema(node.items) && itemPath.split('/').filter(Boolean).length > 1 && fieldOverrides[itemPath]?.javaType !== 'String') {
        const typeName = getResolvedEnumTypeName(itemPath, generatorOptions)
        if (!emittedNames.has(typeName)) {
          emittedNames.add(typeName)
          enumBlocks.push(renderEnumBlock(typeName, node.items.enum as string[], indentLevel))
        }
      }

      visit(node.items, itemPath)
      return
    }

    if (getDeclaredType(node) === 'object' && node.properties) {
      Object.entries(node.properties).forEach(([propertyName, propertySchema]) => {
        visit(propertySchema, `${path}/${propertyName}`)
      })
    }
  }

  Object.entries(schema.properties || {}).forEach(([propertyName, propertySchema]) => {
    visit(propertySchema, `/${propertyName}`)
  })

  return enumBlocks
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
