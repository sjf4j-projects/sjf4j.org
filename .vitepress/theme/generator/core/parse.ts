import { toPascalCase } from './naming'
import { normalizeSchema } from './normalize'
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

export function resolveClassName(parsedSchema: ParseSchemaResult, options: GeneratorOptions): string {
  if (!parsedSchema.ok) {
    return toPascalCase(options.className || 'GeneratedType')
  }

  return options.className.trim()
    ? toPascalCase(options.className)
    : toPascalCase(parsedSchema.schema.title || 'GeneratedType')
}
