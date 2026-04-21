import { toPascalCase } from './naming'
import { normalizeSchema, normalizeSchemaBundle } from './normalize'
import type { GeneratorOptions, ParseSchemaResult, SchemaNode } from './types'

export function detectObject(input: unknown): SchemaNode {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new Error('Top-level schema must be a JSON object.')
  }

  return input as SchemaNode
}

export function parseSchemaText(schemaText: string): ParseSchemaResult {
  try {
    return {
      ok: true,
      schema: normalizeSchema(detectObject(JSON.parse(schemaText))),
    }
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : 'Invalid JSON input.',
    }
  }
}

function parseBundleDocument(schemaText: string): SchemaNode {
  return detectObject(JSON.parse(schemaText))
}

export function parseSchemaBundleText(schemaText: string, librarySchemaTexts: string[] = []): ParseSchemaResult {
  try {
    const rootSchema = parseBundleDocument(schemaText)
    const librarySchemas = librarySchemaTexts.map((librarySchemaText, index) => {
      try {
        return parseBundleDocument(librarySchemaText)
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Invalid JSON input.'
        throw new Error(`Schema library ${index + 1}: ${message}`)
      }
    })

    return {
      ok: true,
      schema: normalizeSchemaBundle(rootSchema, librarySchemas),
    }
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : 'Invalid JSON input.',
    }
  }
}

export function resolveClassName(parsedSchema: ParseSchemaResult, options: GeneratorOptions): string {
  if (!parsedSchema.ok) {
    return toPascalCase(options.className || 'GeneratedType')
  }

  return options.className.trim()
    ? toPascalCase(options.className)
    : toPascalCase(parsedSchema.schema.title || 'GeneratedType')
}
