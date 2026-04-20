import { describe, expect, it } from 'vitest'
import { createDefaultGeneratorOptions, generateJavaOutput, parseSchemaText } from '../../.vitepress/theme/generator/core'

function generate(schemaText: string, overrides: Partial<ReturnType<typeof createDefaultGeneratorOptions>> = {}): string {
  const options = createDefaultGeneratorOptions()
  Object.assign(options, overrides)

  const parsed = parseSchemaText(schemaText)
  if (!parsed.ok) {
    throw new Error(parsed.error)
  }

  return generateJavaOutput(parsed, options).code
}

describe('generator validation annotations', () => {
  it('maps supported schema constraints to validation annotations on fields', () => {
    const code = generate(`{
      "title": "User",
      "type": "object",
      "required": ["name", "age"],
      "properties": {
        "name": {
          "type": "string",
          "minLength": 3,
          "maxLength": 20,
          "pattern": "^[A-Z].+$"
        },
        "age": {
          "type": "integer",
          "minimum": 18,
          "maximum": 99
        }
      }
    }`, {
      accessorMode: 'none',
      fieldStrategy: 'all',
    })

    expect(code).toContain('import jakarta.validation.constraints.NotNull;')
    expect(code).toContain('import jakarta.validation.constraints.Pattern;')
    expect(code).toContain('import jakarta.validation.constraints.Size;')
    expect(code).toContain('import jakarta.validation.constraints.Min;')
    expect(code).toContain('import jakarta.validation.constraints.Max;')
    expect(code).toContain('@NotNull')
    expect(code).toContain('@Size(min = 3, max = 20)')
    expect(code).toContain('@Pattern(regexp = "^[A-Z].+$")')
    expect(code).toContain('@Min(18)')
    expect(code).toContain('@Max(99)')
  })

  it('honors validation annotation selection toggles', () => {
    const code = generate(`{
      "title": "User",
      "type": "object",
      "required": ["name", "age"],
      "properties": {
        "name": {
          "type": "string",
          "minLength": 3,
          "pattern": "^[A-Z].+$"
        },
        "age": {
          "type": "integer",
          "minimum": 18,
          "maximum": 99
        }
      }
    }`, {
      accessorMode: 'none',
      fieldStrategy: 'all',
      validationAnnotations: ['@Size', '@Pattern'],
    })

    expect(code).toContain('@Size(min = 3)')
    expect(code).toContain('@Pattern(regexp = "^[A-Z].+$")')
    expect(code).not.toContain('@NotNull')
    expect(code).not.toContain('@Min(18)')
    expect(code).not.toContain('@Max(99)')
    expect(code).not.toContain('import jakarta.validation.constraints.NotNull;')
    expect(code).not.toContain('import jakarta.validation.constraints.Min;')
    expect(code).not.toContain('import jakarta.validation.constraints.Max;')
  })

  it('applies supported annotations to JsonObject-backed properties too', () => {
    const code = generate(`{
      "title": "Envelope",
      "type": "object",
      "required": ["name"],
      "properties": {
        "name": {
          "type": "string",
          "minLength": 2,
          "maxLength": 10
        }
      }
    }`, {
      accessorMode: 'none',
      fieldStrategy: 'none',
    })

    expect(code).toContain('@NotNull')
    expect(code).toContain('@Size(min = 2, max = 10)')
    expect(code).toContain('public String getName() {')
  })

  it('skips Min/Max for non-integral minimum and maximum values', () => {
    const code = generate(`{
      "title": "Price",
      "type": "object",
      "properties": {
        "amount": {
          "type": "number",
          "minimum": 1.5,
          "maximum": 99.9
        }
      }
    }`, {
      accessorMode: 'none',
      fieldStrategy: 'all',
      numberMapping: 'BigDecimal',
    })

    expect(code).not.toContain('@Min(')
    expect(code).not.toContain('@Max(')
  })
})
