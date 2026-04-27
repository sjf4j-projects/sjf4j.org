import type { SchemaNode } from './types'

type SchemaDocumentRecord = {
  key: string
  id: string | undefined
  resolvedId: string | undefined
  schema: SchemaNode
}

type NormalizationState = {
  allowUnresolvedExternalRefs: boolean
  documentsById: Map<string, SchemaDocumentRecord>
  documentsByKey: Map<string, SchemaDocumentRecord>
}

const ROOT_DOCUMENT_KEY = '__root__'
const BUNDLE_BASE_URL = 'https://schema-bundle.local.invalid/'

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
  if (ref === '#') {
    return rootSchema
  }

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

function resolveDocumentIdAgainstBase(documentId: string, baseId: string): string {
  try {
    return new URL(documentId, baseId).href
  } catch {
    return documentId
  }
}

function getDocumentBaseId(document: SchemaDocumentRecord | undefined): string {
  return document?.resolvedId || BUNDLE_BASE_URL
}

function createSingleDocumentState(rootSchema: SchemaNode): NormalizationState {
  const rootDocument: SchemaDocumentRecord = {
    key: ROOT_DOCUMENT_KEY,
    id: rootSchema.$id,
    resolvedId: rootSchema.$id ? resolveDocumentIdAgainstBase(rootSchema.$id, BUNDLE_BASE_URL) : undefined,
    schema: rootSchema,
  }

  const documentsByKey = new Map<string, SchemaDocumentRecord>([[ROOT_DOCUMENT_KEY, rootDocument]])
  const documentsById = new Map<string, SchemaDocumentRecord>()
  if (rootSchema.$id) {
    documentsById.set(rootSchema.$id, rootDocument)
  }

  return {
    allowUnresolvedExternalRefs: true,
    documentsById,
    documentsByKey,
  }
}

function createBundleState(rootSchema: SchemaNode, librarySchemas: SchemaNode[]): NormalizationState {
  const documentsByKey = new Map<string, SchemaDocumentRecord>()
  const documentsById = new Map<string, SchemaDocumentRecord>()

  const documents: SchemaDocumentRecord[] = [
    {
      key: ROOT_DOCUMENT_KEY,
      id: rootSchema.$id,
      resolvedId: rootSchema.$id ? resolveDocumentIdAgainstBase(rootSchema.$id, BUNDLE_BASE_URL) : undefined,
      schema: rootSchema,
    },
    ...librarySchemas.map((schema, index) => ({
      key: `__library_${index + 1}__`,
      id: schema.$id,
      resolvedId: schema.$id ? resolveDocumentIdAgainstBase(schema.$id, BUNDLE_BASE_URL) : undefined,
      schema,
    })),
  ]

  for (const document of documents) {
    documentsByKey.set(document.key, document)

    if (!document.id || !document.resolvedId) {
      continue
    }

    const existing = documentsById.get(document.resolvedId)
    if (existing) {
      throw new Error(`Duplicate schema document id '${document.id}'.`)
    }

    documentsById.set(document.resolvedId, document)
  }

  return {
    allowUnresolvedExternalRefs: false,
    documentsById,
    documentsByKey,
  }
}

function getDocumentSchema(state: NormalizationState, documentKey: string): SchemaNode {
  const document = state.documentsByKey.get(documentKey)
  if (!document) {
    throw new Error(`Unknown schema document key '${documentKey}'.`)
  }

  return document.schema
}

function parseExternalRef(ref: string): { documentId: string; pointer: string } {
  const hashIndex = ref.indexOf('#')
  if (hashIndex === -1) {
    return {
      documentId: ref,
      pointer: '#',
    }
  }

  const documentId = ref.slice(0, hashIndex)
  const fragment = ref.slice(hashIndex + 1)
  if (fragment.length === 0) {
    return {
      documentId,
      pointer: '#',
    }
  }

  if (!fragment.startsWith('/')) {
    throw new Error(`Only JSON Pointer fragments are supported in $ref '${ref}'.`)
  }

  return {
    documentId,
    pointer: `#${fragment}`,
  }
}

function resolveExternalDocument(state: NormalizationState, currentDocumentKey: string, documentId: string): SchemaDocumentRecord | undefined {
  const currentDocument = state.documentsByKey.get(currentDocumentKey)
  const resolvedDocumentId = resolveDocumentIdAgainstBase(documentId, getDocumentBaseId(currentDocument))
  return state.documentsById.get(resolvedDocumentId)
}

function resolveRefNode(
  schema: SchemaNode,
  path: string,
  state: NormalizationState,
  currentDocumentKey: string,
  seenRefs: string[],
): { schema: SchemaNode; documentKey: string; refKey?: string } {
  if (!schema.$ref) {
    return {
      schema,
      documentKey: currentDocumentKey,
    }
  }

  if (schema.$ref.startsWith('#')) {
    const circularRefKey = `${currentDocumentKey}:${schema.$ref}`
    if (seenRefs.includes(circularRefKey)) {
      throw new Error(`Circular local $ref '${schema.$ref}' detected at '${path || '$'}'.`)
    }

    const resolved = resolvePointer(getDocumentSchema(state, currentDocumentKey), schema.$ref)
    const { $ref: _localRef, ...rest } = schema

    return {
      schema: {
        ...resolved,
        ...rest,
        $defs: rest.$defs || resolved.$defs,
      },
      documentKey: currentDocumentKey,
      refKey: circularRefKey,
    }
  }

  const { documentId, pointer } = parseExternalRef(schema.$ref)
  const targetDocument = resolveExternalDocument(state, currentDocumentKey, documentId)
  if (!targetDocument) {
    if (state.allowUnresolvedExternalRefs) {
      const { $ref: _ignoredRef, ...rest } = schema
      return {
        schema: rest,
        documentKey: currentDocumentKey,
      }
    }

    throw new Error(`No schema document found for id '${documentId}'.`)
  }

  const circularRefKey = `${targetDocument.key}:${pointer}`
  if (seenRefs.includes(circularRefKey)) {
    throw new Error(`Circular $ref '${schema.$ref}' detected at '${path || '$'}'.`)
  }

  const resolved = resolvePointer(targetDocument.schema, pointer)
  const { $ref: _externalRef, ...rest } = schema

  return {
    schema: {
      ...resolved,
      ...rest,
      $defs: rest.$defs || resolved.$defs,
    },
    documentKey: targetDocument.key,
    refKey: circularRefKey,
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

function mergePropertyDefinition(
  name: string,
  left: SchemaNode,
  right: SchemaNode,
  path: string,
  state: NormalizationState,
  currentDocumentKey: string,
  seenRefs: string[],
): SchemaNode {
  if (isSameSchema(left, right)) {
    return left
  }

  try {
    return normalizeSchemaInternal(
      { allOf: [left, right] },
      `${path}/properties/${name}`,
      state,
      currentDocumentKey,
      seenRefs,
    )
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('Only object allOf merge is supported')) {
      throw new Error(`Conflicting property definition for '${name}' in allOf at '${path || '$'}'.`)
    }

    throw error
  }
}

function normalizeSchemaInternal(
  schema: SchemaNode,
  path: string,
  state: NormalizationState,
  currentDocumentKey: string,
  seenRefs: string[],
): SchemaNode {
  const resolvedRef = resolveRefNode(schema, path, state, currentDocumentKey, seenRefs)
  const refResolvedSchema = resolvedRef.schema
  const refResolvedDocumentKey = resolvedRef.documentKey
  const nextSeenRefs = resolvedRef.refKey
    ? [...seenRefs, resolvedRef.refKey]
    : seenRefs

  const normalizedDefs = refResolvedSchema.$defs
    ? Object.fromEntries(
      Object.entries(refResolvedSchema.$defs).map(([name, child]) => [name, normalizeSchemaInternal(child, `${path}/$defs/${name}`, state, refResolvedDocumentKey, nextSeenRefs)]),
    )
    : undefined

  const normalizedProperties = refResolvedSchema.properties
    ? Object.fromEntries(
      Object.entries(refResolvedSchema.properties).map(([name, child]) => [name, normalizeSchemaInternal(child, `${path}/${name}`, state, refResolvedDocumentKey, nextSeenRefs)]),
    )
    : undefined

  const normalizedItems = refResolvedSchema.items
    ? normalizeSchemaInternal(refResolvedSchema.items, `${path}/0`, state, refResolvedDocumentKey, nextSeenRefs)
    : undefined
  const normalizedAdditionalProperties = typeof refResolvedSchema.additionalProperties === 'object' && refResolvedSchema.additionalProperties !== null && !Array.isArray(refResolvedSchema.additionalProperties)
    ? normalizeSchemaInternal(refResolvedSchema.additionalProperties, `${path}/additionalProperties`, state, refResolvedDocumentKey, nextSeenRefs)
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

  const normalizedBranches = refResolvedSchema.allOf.map((entry, index) => normalizeSchemaInternal(entry, `${path}/allOf/${index}`, state, refResolvedDocumentKey, nextSeenRefs))
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
      if (mergedProperties[name]) {
        mergedProperties[name] = mergePropertyDefinition(
          name,
          mergedProperties[name],
          child,
          path,
          state,
          refResolvedDocumentKey,
          nextSeenRefs,
        )
        continue
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

export function normalizeSchema(schema: SchemaNode, path = '', rootSchema: SchemaNode = schema, seenRefs: string[] = []): SchemaNode {
  return normalizeSchemaInternal(schema, path, createSingleDocumentState(rootSchema), ROOT_DOCUMENT_KEY, seenRefs)
}

export function normalizeSchemaBundle(rootSchema: SchemaNode, librarySchemas: SchemaNode[]): SchemaNode {
  return normalizeSchemaInternal(rootSchema, '', createBundleState(rootSchema, librarySchemas), ROOT_DOCUMENT_KEY, [])
}
