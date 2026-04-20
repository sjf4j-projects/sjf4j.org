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
  it('generates cached root-only descendant path accessors for fixed paths and ByPath APIs for indexed paths', () => {
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

    expect(code).toContain('import org.sjf4j.path.JsonPath;')
    expect(code).toContain('private static final JsonPath PATH_CUSTOMER_EMAIL = JsonPath.compile("$.customer.email");')
    expect(code).toContain('public String getCustomerEmail() {')
    expect(code).toContain('return PATH_CUSTOMER_EMAIL.getString(this);')
    expect(code).toContain('public void setCustomerEmail(String value) {')
    expect(code).toContain('PATH_CUSTOMER_EMAIL.ensurePut(this, value);')
    expect(code).toContain('public ItemsItem getItems(int itemsIndex) {')
    expect(code).toContain('return getByPath("$.items[" + itemsIndex + "]", ItemsItem.class);')
    expect(code).toContain('public String getItemsSku(int itemsIndex) {')
    expect(code).toContain('return getStringByPath("$.items[" + itemsIndex + "].sku");')
    expect(code).toContain('ensurePutByPath("$.items[" + itemsIndex + "].sku", value);')
    expect(code).not.toContain('PATH_ITEMS_SKU')
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
    expect(code).toContain('private static final JsonPath PATH_PROFILE_TAGS = JsonPath.compile("$.profile.tags");')
    expect(code).toContain('return PATH_PROFILE_TAGS.getList(this, String.class);')
    expect(code).toContain('public LocalDateTime getProfileCreatedAt() {')
    expect(code).toContain('return PATH_PROFILE_CREATED_AT.get(this, LocalDateTime.class);')
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
    expect(code).not.toContain('ensurePutByPath(')
  })

  it('uses JsonObject path types in pathOnly mode', () => {
    const code = generate(`{
      "title": "Order",
      "type": "object",
      "properties": {
        "customer": {
          "type": "object",
          "properties": {
            "address": {
              "type": "object",
              "properties": {
                "zip": { "type": "string" }
              }
            }
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
      modelingStrategy: 'pathOnly',
    })

    expect(code).toContain('private JsonObject customer;')
    expect(code).toContain('private List<JsonObject> items;')
    expect(code).toContain('public JsonObject getCustomerAddress() {')
    expect(code).toContain('return PATH_CUSTOMER_ADDRESS.getJsonObject(this);')
    expect(code).toContain('public JsonObject getItems(int itemsIndex) {')
    expect(code).toContain('return getJsonObjectByPath("$.items[" + itemsIndex + "]");')
    expect(code).toContain('public String getItemsSku(int itemsIndex) {')
    expect(code).not.toContain('ItemsItem.class')
  })
})
