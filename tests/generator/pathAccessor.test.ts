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

describe('generator path accessors', () => {
  it('generates root-only descendant path accessors with ByPath APIs', () => {
    const code = generate(`{
      "title": "Order",
      "type": "object",
      "properties": {
        "id": { "type": "string" },
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
    }`, {
      accessorMode: 'none',
      pathAccessorStrategy: 'all',
    })

    expect(code).toContain('public String getCustomerEmail() {')
    expect(code).toContain('return getStringByPath("$.customer.email");')
    expect(code).toContain('public void setCustomerEmail(String value) {')
    expect(code).toContain('putByPath("$.customer.email", value);')
    expect(code).toContain('public ItemsItem getItems(int itemsIndex) {')
    expect(code).toContain('return getByPath("$.items[" + itemsIndex + "]", ItemsItem.class);')
    expect(code).toContain('public String getItemsSku(int itemsIndex) {')
    expect(code).toContain('return getStringByPath("$.items[" + itemsIndex + "].sku");')
    expect(code).not.toContain('getStringByPath("$.id")')
    expect(code).not.toContain('getByPath("$.customer", Customer.class)')
  })

  it('respects required-only path accessor strategy', () => {
    const code = generate(`{
      "title": "Order",
      "type": "object",
      "required": ["customer", "items"],
      "properties": {
        "customer": {
          "type": "object",
          "required": ["email"],
          "properties": {
            "email": { "type": "string" },
            "phone": { "type": "string" }
          }
        },
        "items": {
          "type": "array",
          "items": {
            "type": "object",
            "required": ["sku"],
            "properties": {
              "sku": { "type": "string" },
              "title": { "type": "string" }
            }
          }
        }
      }
    }`, {
      accessorMode: 'none',
      pathAccessorStrategy: 'required',
    })

    expect(code).toContain('public String getCustomerEmail() {')
    expect(code).toContain('public String getItemsSku(int itemsIndex) {')
    expect(code).not.toContain('public String getCustomerPhone() {')
    expect(code).not.toContain('public ItemsItem getItems(int itemsIndex) {')
    expect(code).not.toContain('public String getItemsTitle(int itemsIndex) {')
  })

  it('uses typed ByPath getters for lists and fallback typed access when needed', () => {
    const code = generate(`{
      "title": "Envelope",
      "type": "object",
      "properties": {
        "profile": {
          "type": "object",
          "properties": {
            "tags": {
              "type": "array",
              "items": { "type": "string" }
            },
            "createdAt": {
              "type": "string",
              "format": "date-time"
            }
          }
        }
      }
    }`, {
      accessorMode: 'none',
      pathAccessorStrategy: 'all',
      dateTimeMapping: 'LocalDateTime',
    })

    expect(code).toContain('public List<String> getProfileTags() {')
    expect(code).toContain('return getListByPath("$.profile.tags", String.class);')
    expect(code).toContain('public LocalDateTime getProfileCreatedAt() {')
    expect(code).toContain('return getByPath("$.profile.createdAt", LocalDateTime.class);')
  })

  it('does not generate path accessors when the root class is a POJO', () => {
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
        }
      }
    }`, {
      accessorMode: 'none',
      pathAccessorStrategy: 'all',
      modelingStrategy: 'pojo',
    })

    expect(code).not.toContain('getCustomerEmail()')
    expect(code).not.toContain('putByPath(')
  })
})
