import { describe, expect, it } from 'vitest'
import { createDefaultGeneratorOptions, generateJavaOutput, parseSchemaText, type FieldOverride } from '../../.vitepress/theme/generator/core'

function generate(
  schemaText: string,
  modelingStrategy: 'jojo' | 'pojo' | 'pathOnly' = 'jojo',
  fieldOverrides: Record<string, FieldOverride> = {},
): string {
  const options = createDefaultGeneratorOptions()
  options.modelingStrategy = modelingStrategy

  const parsed = parseSchemaText(schemaText)
  if (!parsed.ok) {
    throw new Error(parsed.error)
  }

  return generateJavaOutput(parsed, options, fieldOverrides).code
}

describe('generator modeling strategy', () => {
  it('renders omitted additionalProperties as JOJO', () => {
    const code = generate(`{
      "title": "Order",
      "type": "object",
      "properties": {
        "id": { "type": "string" }
      }
    }`)

    expect(code).toContain('import org.sjf4j.JsonObject;')
    expect(code).toContain('import lombok.Getter;')
    expect(code).toContain('import lombok.Setter;')
    expect(code).toContain('public class Order extends JsonObject {')
    expect(code).toContain('@Getter @Setter')
    expect(code).not.toContain('@NodeBinding(readDynamic = false)')
  })

  it('renders strict schemas as JOJO with NodeBinding when JOJO is preferred', () => {
    const code = generate(`{
      "title": "Order",
      "type": "object",
      "additionalProperties": false,
      "properties": {
        "id": { "type": "string" }
      }
    }`, 'jojo')

    expect(code).toContain('import org.sjf4j.JsonObject;')
    expect(code).toContain('import org.sjf4j.annotation.NodeBinding;')
    expect(code).toContain('import lombok.Getter;')
    expect(code).toContain('import lombok.Setter;')
    expect(code).toContain('@NodeBinding(readDynamic = false)')
    expect(code).toContain('@Getter @Setter')
    expect(code).toContain('public class Order extends JsonObject {')
  })

  it('renders strict schemas as POJO when POJO is preferred', () => {
    const code = generate(`{
      "title": "Order",
      "type": "object",
      "additionalProperties": false,
      "properties": {
        "id": { "type": "string" }
      }
    }`, 'pojo')

    expect(code).not.toContain('import org.sjf4j.JsonObject;')
    expect(code).not.toContain('import org.sjf4j.annotation.NodeBinding;')
    expect(code).not.toContain('import lombok.Getter;')
    expect(code).not.toContain('import lombok.Setter;')
    expect(code).not.toContain('@NodeBinding(readDynamic = false)')
    expect(code).toContain('@Data')
    expect(code).not.toContain('@Getter')
    expect(code).not.toContain('@Setter')
    expect(code).toContain('public class Order {')
    expect(code).not.toContain('public class Order extends JsonObject {')
  })

  it('renders nested objects as inner classes', () => {
    const code = generate(`{
      "title": "Order",
      "type": "object",
      "properties": {
        "customer": {
          "type": "object",
          "properties": {
            "email": { "type": "string" }
          }
        },
        "items": {
          "type": "array",
          "items": {
            "type": "object",
            "properties": {
              "sku": { "type": "string" }
            }
          }
        }
      }
    }`)

    expect(code).toContain('private Customer customer;')
    expect(code).toContain('private List<ItemsItem> items;')
    expect(code).toContain(' * JSON shape:')
    expect(code).toContain('public static class Customer extends JsonObject {')
    expect(code.match(/JSON shape:/g)?.length).toBe(1)
    expect(code).toContain('public static class ItemsItem extends JsonObject {')
    expect(code).not.toContain('class Customer.java')
  })

  it('lets nested object members fall back to JsonObject when overridden', () => {
    const code = generate(`{
      "title": "Order",
      "type": "object",
      "properties": {
        "customer": {
          "type": "object",
          "properties": {
            "email": { "type": "string" }
          }
        }
      }
    }`, 'jojo', {
      '/customer': { memberKind: 'field', javaType: 'JsonObject' },
    })

    expect(code).toContain('private JsonObject customer;')
    expect(code).not.toContain('public static class Customer extends JsonObject {')
  })

  it('applies modeling strategy to nested objects too', () => {
    const jojoCode = generate(`{
      "title": "Order",
      "type": "object",
      "additionalProperties": false,
      "properties": {
        "customer": {
          "type": "object",
          "additionalProperties": false,
          "properties": {
            "email": { "type": "string" }
          }
        }
      }
    }`, 'jojo')

    const pojoCode = generate(`{
      "title": "Order",
      "type": "object",
      "additionalProperties": false,
      "properties": {
        "customer": {
          "type": "object",
          "additionalProperties": false,
          "properties": {
            "email": { "type": "string" }
          }
        }
      }
    }`, 'pojo')

    expect(jojoCode).toContain('public static class Customer extends JsonObject {')
    expect(jojoCode).toContain('@NodeBinding(readDynamic = false)')

    expect(pojoCode).toContain('public static class Customer {')
    expect(pojoCode).not.toContain('public static class Customer extends JsonObject {')
  })

  it('renders pathOnly root schemas as JOJO and suppresses nested classes', () => {
    const code = generate(`{
      "title": "Order",
      "type": "object",
      "additionalProperties": false,
      "properties": {
        "customer": {
          "type": "object",
          "properties": {
            "email": { "type": "string" }
          }
        },
        "items": {
          "type": "array",
          "items": {
            "type": "object",
            "properties": {
              "sku": { "type": "string" }
            }
          }
        }
      }
    }`, 'pathOnly')

    expect(code).toContain('public class Order extends JsonObject {')
    expect(code).toContain('@NodeBinding(readDynamic = false)')
    expect(code).toContain('private JsonObject customer;')
    expect(code).toContain('private List<JsonObject> items;')
    expect(code).not.toContain('public static class Customer')
    expect(code).not.toContain('public static class ItemsItem')
  })
})
