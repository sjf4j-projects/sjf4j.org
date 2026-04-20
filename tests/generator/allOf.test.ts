import { describe, expect, it } from 'vitest'
import { createDefaultGeneratorOptions, generateJavaOutput, parseSchemaText } from '../../.vitepress/theme/generator/core'

function generate(schemaText: string, overrides: Partial<ReturnType<typeof createDefaultGeneratorOptions>> = {}) {
  const options = createDefaultGeneratorOptions()
  Object.assign(options, overrides)

  const parsed = parseSchemaText(schemaText)
  return {
    parsed,
    output: generateJavaOutput(parsed, options),
  }
}

describe('generator allOf normalization', () => {
  it('flattens top-level object allOf before rendering', () => {
    const { parsed, output } = generate(`{
      "title": "Order",
      "description": "Merged order schema.",
      "allOf": [
        {
          "type": "object",
          "required": ["id"],
          "properties": {
            "id": { "type": "string" }
          }
        },
        {
          "type": "object",
          "required": ["amount"],
          "properties": {
            "amount": { "type": "number" }
          }
        }
      ]
    }`, {
      accessorMode: 'none',
    })

    expect(parsed.ok).toBe(true)
    if (!parsed.ok) {
      return
    }

    expect(parsed.schema.type).toBe('object')
    expect(parsed.schema.required).toEqual(['id', 'amount'])
    expect(Object.keys(parsed.schema.properties || {})).toEqual(['id', 'amount'])
    expect(output.code).toContain('private String id;')
    expect(output.code).toContain('private double amount;')
  })

  it('applies nested allOf merge before inner-class generation', () => {
    const { output } = generate(`{
      "title": "Order",
      "type": "object",
      "properties": {
        "customer": {
          "allOf": [
            {
              "type": "object",
              "additionalProperties": false,
              "properties": {
                "email": { "type": "string" }
              }
            },
            {
              "type": "object",
              "properties": {
                "name": { "type": "string" }
              }
            }
          ]
        }
      }
    }`, {
      accessorMode: 'none',
      modelingStrategy: 'jojo',
    })

    expect(output.code).toContain('@NodeBinding(readDynamic = false)')
    expect(output.code).toContain('public static class Customer extends JsonObject {')
    expect(output.code).toContain('private String email;')
    expect(output.code).toContain('private String name;')
  })

  it('prefers outer title and description over allOf branches', () => {
    const { parsed } = generate(`{
      "title": "Order",
      "description": "Outer description.",
      "allOf": [
        {
          "type": "object",
          "title": "IgnoredBranchTitle",
          "description": "Ignored branch description.",
          "properties": {
            "id": { "type": "string" }
          }
        }
      ]
    }`)

    expect(parsed.ok).toBe(true)
    if (!parsed.ok) {
      return
    }

    expect(parsed.schema.title).toBe('Order')
    expect(parsed.schema.description).toBe('Outer description.')
  })

  it('reports conflicting property definitions in allOf', () => {
    const { parsed, output } = generate(`{
      "title": "BrokenOrder",
      "allOf": [
        {
          "type": "object",
          "properties": {
            "id": { "type": "string" }
          }
        },
        {
          "type": "object",
          "properties": {
            "id": { "type": "integer" }
          }
        }
      ]
    }`)

    expect(parsed.ok).toBe(false)
    if (!parsed.ok) {
      expect(parsed.error).toContain("Conflicting property definition for 'id' in allOf")
    }
    expect(output.error).toContain("Conflicting property definition for 'id' in allOf")
  })

  it('resolves local refs before allOf merge', () => {
    const { parsed, output } = generate(`{
      "title": "DomainDoc",
      "description": "Domain document.",
      "allOf": [
        {
          "$ref": "#/$defs/base"
        },
        {
          "$ref": "#/$defs/self"
        }
      ],
      "$defs": {
        "base": {
          "type": "object",
          "properties": {
            "idea": { "type": "string" }
          },
          "required": ["idea"]
        },
        "self": {
          "type": "object",
          "properties": {
            "meta": {
              "allOf": [
                { "$ref": "#/$defs/metaBase" },
                {
                  "type": "object",
                  "properties": {
                    "schema": { "type": "object" }
                  },
                  "required": ["schema"]
                }
              ]
            }
          },
          "required": ["meta"]
        },
        "metaBase": {
          "type": "object",
          "additionalProperties": false,
          "properties": {
            "domain": { "type": "object" },
            "storage": { "type": "object" }
          },
          "required": ["domain", "storage"]
        }
      }
    }`, {
      accessorMode: 'none',
      modelingStrategy: 'jojo',
    })

    expect(parsed.ok).toBe(true)
    if (!parsed.ok) {
      return
    }

    expect(parsed.schema.required).toEqual(['idea', 'meta'])
    expect(output.code).toContain('private String idea;')
    expect(output.code).toContain('public static class Meta extends JsonObject {')
    expect(output.code).toContain('@NodeBinding(readDynamic = false)')
    expect(output.code).toContain('private JsonObject domain;')
    expect(output.code).toContain('private JsonObject storage;')
    expect(output.code).toContain('private JsonObject schema;')
  })

  it('ignores non-local refs instead of failing normalization', () => {
    const { parsed, output } = generate(`{
      "title": "DomainDoc",
      "allOf": [
        {
          "$ref": "metaplus_doc.json"
        },
        {
          "type": "object",
          "properties": {
            "meta": { "type": "object" }
          },
          "required": ["meta"]
        }
      ]
    }`, {
      accessorMode: 'none',
    })

    expect(parsed.ok).toBe(true)
    if (!parsed.ok) {
      return
    }

    expect(parsed.schema.required).toEqual(['meta'])
    expect(output.error).toBe('')
    expect(output.code).toContain('private JsonObject meta;')
  })
})
