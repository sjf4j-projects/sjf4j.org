import type { SchemaNode } from './types'

const STRUCTURAL_KEYS = new Set([
  'type',
  'properties',
  'required',
  'additionalProperties',
  'items',
  'enum',
  'format',
  'allOf',
])

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(canonicalize)
  }

  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, entry]) => [key, canonicalize(entry)]),
    )
  }

  return value
}

function isSameSchema(left: SchemaNode, right: SchemaNode): boolean {
  return JSON.stringify(canonicalize(left)) === JSON.stringify(canonicalize(right))
}

function isObjectLikeSchema(node: SchemaNode | undefined): node is SchemaNode {
  if (!node) {
    return false
  }

  return node.type === 'object'
    || (Array.isArray(node.type) && node.type.includes('object'))
    || !!node.properties
    || node.additionalProperties !== undefined
}

function hasStructuralContent(node: SchemaNode): boolean {
  return Object.entries(node).some(([key, value]) => STRUCTURAL_KEYS.has(key) && value !== undefined)
}

function resolvePointer(rootSchema: SchemaNode, ref: string): SchemaNode {
  const segments = ref
    .slice(2)
    .split('/')
    .map((segment) => segment.replace(/~1/g, '/').replace(/~0/g, '~'))

  let current: unknown = rootSchema
  for (const segment of segments) {
    if (!current || typeof current !== 'object' || Array.isArray(current) || !(segment in current)) {
      throw new Error(`Unresolved local $ref '${ref}'.`)
    }

    current = (current as Record<string, unknown>)[segment]
  }

  if (!current || typeof current !== 'object' || Array.isArray(current)) {
    throw new Error(`Local $ref '${ref}' does not resolve to an object schema.`)
  }

  return current as SchemaNode
}

function resolveRefNode(schema: SchemaNode, rootSchema: SchemaNode, path: string, seenRefs: string[]): SchemaNode {
  if (!schema.$ref) {
    return schema
  }

  if (!schema.$ref.startsWith('#/')) {
    const { $ref: _ignoredRef, ...rest } = schema
    return rest
  }

  if (seenRefs.includes(schema.$ref)) {
    throw new Error(`Circular local $ref '${schema.$ref}' detected at '${path || '$'}'.`)
  }

  const resolved = resolvePointer(rootSchema, schema.$ref)
  const { $ref: _localRef, ...rest } = schema
  return {
    ...resolved,
    ...rest,
    $defs: rest.$defs || resolved.$defs,
  }
}

function normalizeAdditionalProperties(
  values: Array<boolean | SchemaNode | undefined>,
  path: string,
): boolean | SchemaNode | undefined {
  if (values.some((value) => value === false)) {
    return false
  }

  const schemaValues = values.filter((value): value is SchemaNode => !!value && typeof value === 'object' && !Array.isArray(value))
  if (schemaValues.length === 0) {
    return values.some((value) => value === true) ? true : undefined
  }

  const [first, ...rest] = schemaValues
  for (const entry of rest) {
    if (!isSameSchema(first, entry)) {
      throw new Error(`Conflicting additionalProperties schema in allOf at '${path || '$'}'.`)
    }
  }

  return first
}

function normalizeInline(node: SchemaNode | undefined, path: string): SchemaNode | undefined {
  if (!node) {
    return undefined
  }

  return normalizeSchema(node, path)
}

function stripUndefined<T extends Record<string, unknown>>(value: T): T {
  return Object.fromEntries(
    Object.entries(value).filter(([, entry]) => entry !== undefined),
  ) as T
}

export function normalizeSchema(schema: SchemaNode, path = '', rootSchema: SchemaNode = schema, seenRefs: string[] = []): SchemaNode {
  const refResolvedSchema = resolveRefNode(schema, rootSchema, path, seenRefs)
  const nextSeenRefs = refResolvedSchema === schema || !schema.$ref || !schema.$ref.startsWith('#/')
    ? seenRefs
    : [...seenRefs, schema.$ref]

  const normalizedDefs = refResolvedSchema.$defs
    ? Object.fromEntries(
      Object.entries(refResolvedSchema.$defs).map(([name, child]) => [name, normalizeSchema(child, `${path}/$defs/${name}`, rootSchema, nextSeenRefs)]),
    )
    : undefined

  const normalizedProperties = refResolvedSchema.properties
    ? Object.fromEntries(
      Object.entries(refResolvedSchema.properties).map(([name, child]) => [name, normalizeSchema(child, `${path}/${name}`, rootSchema, nextSeenRefs)]),
    )
    : undefined

  const normalizedItems = refResolvedSchema.items
    ? normalizeSchema(refResolvedSchema.items, `${path}/0`, rootSchema, nextSeenRefs)
    : undefined
  const normalizedAdditionalProperties = typeof refResolvedSchema.additionalProperties === 'object' && refResolvedSchema.additionalProperties !== null && !Array.isArray(refResolvedSchema.additionalProperties)
    ? normalizeSchema(refResolvedSchema.additionalProperties, `${path}/additionalProperties`, rootSchema, nextSeenRefs)
    : refResolvedSchema.additionalProperties

  const baseNode: SchemaNode = stripUndefined({
    ...refResolvedSchema,
    $ref: undefined,
    $defs: normalizedDefs,
    properties: normalizedProperties,
    items: normalizedItems,
    additionalProperties: normalizedAdditionalProperties,
    allOf: undefined,
  })

  if (!refResolvedSchema.allOf || refResolvedSchema.allOf.length === 0) {
    return baseNode
  }

  const normalizedBranches = refResolvedSchema.allOf.map((entry, index) => normalizeSchema(entry, `${path}/allOf/${index}`, rootSchema, nextSeenRefs))
  const mergeCandidates = [baseNode, ...normalizedBranches]
  const objectCandidates = mergeCandidates.filter(hasStructuralContent)

  if (objectCandidates.some((entry) => !isObjectLikeSchema(entry))) {
    throw new Error(`Only object allOf merge is supported at '${path || '$'}'.`)
  }

  const mergedProperties: Record<string, SchemaNode> = {}
  const mergedRequired = new Set<string>()

  for (const candidate of mergeCandidates) {
    for (const requiredName of candidate.required || []) {
      mergedRequired.add(requiredName)
    }

    for (const [name, child] of Object.entries(candidate.properties || {})) {
      if (mergedProperties[name] && !isSameSchema(mergedProperties[name], child)) {
        throw new Error(`Conflicting property definition for '${name}' in allOf at '${path || '$'}'.`)
      }

      mergedProperties[name] = child
    }
  }

  const merged: SchemaNode = stripUndefined({
    ...baseNode,
    type: 'object',
    title: baseNode.title || normalizedBranches.find((entry) => entry.title)?.title,
    description: baseNode.description || normalizedBranches.find((entry) => entry.description)?.description,
    properties: Object.keys(mergedProperties).length > 0 ? mergedProperties : undefined,
    required: mergedRequired.size > 0 ? Array.from(mergedRequired) : undefined,
    additionalProperties: normalizeAdditionalProperties(
      mergeCandidates.map((entry) => entry.additionalProperties),
      path,
    ),
  })

  return merged
}
