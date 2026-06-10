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

describe('generator enum mapping', () => {
  it('renders root-owned string enums as nested enums', () => {
    const code = generate(`{
      "title": "Order",
      "type": "object",
      "properties": {
        "status": {
          "type": "string",
          "enum": ["paid", "in-progress", "123"]
        }
      }
    }`, {
      accessorMode: 'none',
      enumMapping: 'javaEnum',
    })

    expect(code).toContain('private StatusEnum status;')
    expect(code).toContain('public enum StatusEnum {')
    expect(code).toContain('PAID,')
    expect(code).toContain('IN_PROGRESS,')
    expect(code).toContain('VALUE_123')
  })

  it('renders nested object enums inside the owning inner class', () => {
    const code = generate(`{
      "title": "Order",
      "type": "object",
      "properties": {
        "customer": {
          "type": "object",
          "properties": {
            "tier": {
              "type": "string",
              "enum": ["vip", "normal"]
            }
          }
        }
      }
    }`, {
      accessorMode: 'none',
      enumMapping: 'javaEnum',
    })

    expect(code).toContain('public static class Customer extends JsonObject {')
    expect(code).toContain('private TierEnum tier;')
    expect(code).toContain('public enum TierEnum {')
    expect(code).toContain('VIP,')
    expect(code).toContain('NORMAL')
  })

  it('uses typed enum access for properties and by-path methods', () => {
    const code = generate(`{
      "title": "Order",
      "type": "object",
      "properties": {
        "customer": {
          "type": "object",
          "properties": {
            "tier": {
              "type": "string",
              "enum": ["vip", "normal"]
            }
          }
        }
      }
    }`, {
      accessorMode: 'none',
      fieldStrategy: 'none',
      pathAccessorStrategy: 'all',
      pathStrategy: 'jsonPath',
      enumMapping: 'javaEnum',
    })

    expect(code).toContain('public TierEnum getTier() {')
    expect(code).toContain('return get("tier", TierEnum.class);')
    expect(code).toContain('public TierEnum getCustomerTier() {')
    expect(code).toContain('private static final JsonPath PATH_CUSTOMER_TIER = JsonPath.parse("$.customer.tier");')
    expect(code).toContain('return PATH_CUSTOMER_TIER.get(this, TierEnum.class);')
  })

  it('keeps plainString mode without generating nested enums', () => {
    const code = generate(`{
      "title": "Order",
      "type": "object",
      "properties": {
        "status": {
          "type": "string",
          "enum": ["paid", "unpaid"]
        }
      }
    }`, {
      accessorMode: 'none',
      enumMapping: 'plainString',
    })

    expect(code).toContain('private String status;')
    expect(code).not.toContain('public enum StatusEnum {')
  })

  it('supports lists of string enums with typed list getters', () => {
    const code = generate(`{
      "title": "Order",
      "type": "object",
      "properties": {
        "statuses": {
          "type": "array",
          "items": {
            "type": "string",
            "enum": ["paid", "unpaid"]
          }
        }
      }
    }`, {
      accessorMode: 'none',
      fieldStrategy: 'none',
      enumMapping: 'javaEnum',
    })

    expect(code).toContain('public List<StatusesItemEnum> getStatuses() {')
    expect(code).toContain('return getList("statuses", StatusesItemEnum.class);')
    expect(code).toContain('public enum StatusesItemEnum {')
  })

  it('hoists descendant enums to the root class in pathOnly mode', () => {
    const code = generate(`{
      "title": "Order",
      "type": "object",
      "properties": {
        "customer": {
          "type": "object",
          "properties": {
            "tier": {
              "type": "string",
              "enum": ["vip", "normal"]
            }
          }
        }
      }
    }`, {
      accessorMode: 'none',
      fieldStrategy: 'none',
      pathAccessorStrategy: 'all',
      pathStrategy: 'jsonPath',
      enumMapping: 'javaEnum',
      modelingStrategy: 'pathOnly',
    })

    expect(code).toContain('public JsonObject getCustomer() {')
    expect(code).toContain('return getJsonObject("customer");')
    expect(code).toContain('public CustomerTierEnum getCustomerTier() {')
    expect(code).toContain('return PATH_CUSTOMER_TIER.get(this, CustomerTierEnum.class);')
    expect(code).toContain('public enum CustomerTierEnum {')
    expect(code).not.toContain('public static class Customer')
    expect(code).not.toContain('public enum TierEnum {')
  })
})
