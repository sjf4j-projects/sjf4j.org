import { describe, expect, it } from 'vitest'
import {
  buildParsedFieldList,
  createDefaultGeneratorOptions,
  parseSchemaText,
  resolveClassName,
} from '../../.vitepress/theme/generator/core'

describe('generator core smoke', () => {
  it('rejects invalid top-level schemas', () => {
    const result = parseSchemaText('[]')

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error).toBe('Top-level schema must be a JSON object.')
    }
  })

  it('resolves class name from explicit option before schema title', () => {
    const parsed = parseSchemaText('{"title":"Order","type":"object","properties":{}}')
    const options = createDefaultGeneratorOptions()
    options.className = 'checkout summary'

    expect(resolveClassName(parsed, options)).toBe('CheckoutSummary')
  })

  it('builds nested field descriptors for objects and arrays', () => {
    const parsed = parseSchemaText(`{
      "title": "Order",
      "type": "object",
      "required": ["customer", "items"],
      "properties": {
        "customer": {
          "type": "object",
          "required": ["email"],
          "properties": {
            "email": { "type": "string" }
          }
        },
        "items": {
          "type": "array",
          "items": {
            "type": "object",
            "required": ["sku"],
            "properties": {
              "sku": { "type": "string" }
            }
          }
        }
      }
    }`)

    expect(parsed.ok).toBe(true)
    if (!parsed.ok) {
      return
    }

    const fields = buildParsedFieldList(parsed.schema, createDefaultGeneratorOptions())

    expect(fields.map((field) => [field.path, field.displayPath, field.required, field.javaType])).toEqual([
      ['/customer', '$.customer', true, 'JsonObject'],
      ['/customer/email', '$.customer.email', true, 'String'],
      ['/items', '$.items', true, 'List<Map<String, Object>>'],
      ['/items/0', '$.items[*]', false, 'JsonObject'],
      ['/items/0/sku', '$.items[*].sku', true, 'String'],
    ])
  })
})
