import { describe, expect, it } from 'vitest'
import { createDefaultGeneratorOptions, generateJavaOutput, parseSchemaBundleText } from '../../.vitepress/theme/generator/core'

function generateFromBundle(
  schemaText: string,
  librarySchemaTexts: string[] = [],
  overrides: Partial<ReturnType<typeof createDefaultGeneratorOptions>> = {},
) {
  const options = createDefaultGeneratorOptions()
  Object.assign(options, overrides)

  const parsed = parseSchemaBundleText(schemaText, librarySchemaTexts)
  return {
    parsed,
    output: generateJavaOutput(parsed, options),
  }
}

describe('generator schema bundle parsing', () => {
  it('resolves cross-document refs by library $id', () => {
    const { parsed, output } = generateFromBundle(`{
      "$ref": "common.json#/$defs/Order"
    }`, [
      `{
        "$id": "common.json",
        "$defs": {
          "Order": {
            "title": "Order",
            "type": "object",
            "required": ["customer"],
            "properties": {
              "customer": { "$ref": "#/$defs/Customer" }
            }
          },
          "Customer": {
            "title": "Customer",
            "type": "object",
            "properties": {
              "email": { "type": "string" }
            }
          }
        }
      }`,
    ], {
      accessorMode: 'none',
      modelingStrategy: 'jojo',
    })

    expect(parsed.ok).toBe(true)
    if (!parsed.ok) {
      return
    }

    expect(parsed.schema.title).toBe('Order')
    expect(output.error).toBe('')
    expect(output.code).toContain('public class Order extends JsonObject {')
    expect(output.code).toContain('private Customer customer;')
    expect(output.code).toContain('public static class Customer extends JsonObject {')
    expect(output.code).toContain('private String email;')
  })

  it('reports missing library ids in the output error path', () => {
    const { parsed, output } = generateFromBundle(`{
      "$ref": "common.json#/$defs/Order"
    }`)

    expect(parsed.ok).toBe(false)
    if (!parsed.ok) {
      expect(parsed.error).toBe("No schema document found for id 'common.json'.")
    }
    expect(output.error).toBe("No schema document found for id 'common.json'.")
  })

  it('resolves relative external refs against the current document $id uri', () => {
    const { parsed, output } = generateFromBundle(`{
      "$id": "https://metaplus.dev/json-schemas/metaplus_doc.json",
      "title": "MetaPlusDoc",
      "type": "object",
      "properties": {
        "idea": {
          "$ref": "base.json#/$defs/idea"
        }
      }
    }`, [
      `{
        "$id": "https://metaplus.dev/json-schemas/base.json",
        "$defs": {
          "idea": {
            "title": "Idea",
            "type": "object",
            "properties": {
              "name": { "type": "string" }
            }
          }
        }
      }`,
    ], {
      accessorMode: 'none',
      modelingStrategy: 'jojo',
    })

    expect(parsed.ok).toBe(true)
    if (!parsed.ok) {
      return
    }

    expect(output.error).toBe('')
    expect(output.code).toContain('public class MetaPlusDoc extends JsonObject {')
    expect(output.code).toContain('private Idea idea;')
    expect(output.code).toContain('public static class Idea extends JsonObject {')
    expect(output.code).toContain('private String name;')
  })

  it('reports invalid library json through the main output error surface', () => {
    const { parsed, output } = generateFromBundle(`{
      "title": "Order",
      "type": "object",
      "properties": {}
    }`, [
      '{',
    ])

    expect(parsed.ok).toBe(false)
    if (!parsed.ok) {
      expect(parsed.error).toContain('Schema library 1:')
    }
    expect(output.code).toBe('')
    expect(output.error).toContain('Schema library 1:')
  })

  it('rejects duplicate library document ids', () => {
    const { parsed, output } = generateFromBundle(`{
      "$ref": "common.json#/$defs/Order"
    }`, [
      `{
        "$id": "common.json",
        "$defs": {}
      }`,
      `{
        "$id": "common.json",
        "$defs": {}
      }`,
    ])

    expect(parsed.ok).toBe(false)
    if (!parsed.ok) {
      expect(parsed.error).toBe("Duplicate schema document id 'common.json'.")
    }
    expect(output.error).toBe("Duplicate schema document id 'common.json'.")
  })
})
