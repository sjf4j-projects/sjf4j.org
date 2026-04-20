import { describe, expect, it } from 'vitest'
import { createDefaultGeneratorOptions, generateJavaOutput, parseSchemaText, type FieldOverride } from '../../.vitepress/theme/generator/core'

function generate(
  schemaText: string,
  overrides: Partial<ReturnType<typeof createDefaultGeneratorOptions>> = {},
  fieldOverrides: Record<string, FieldOverride> = {},
): string {
  const options = createDefaultGeneratorOptions()
  Object.assign(options, overrides)

  const parsed = parseSchemaText(schemaText)
  if (!parsed.ok) {
    throw new Error(parsed.error)
  }

  return generateJavaOutput(parsed, options, fieldOverrides).code
}

describe('generator field strategy', () => {
  it('uses parsed-property default types in generated code even without manual overrides', () => {
    const code = generate(`{
      "title": "User",
      "type": "object",
      "properties": {
        "age": { "type": "integer" },
        "active": { "type": "boolean" },
        "profile": { "type": "object" }
      }
    }`, {
      fieldStrategy: 'all',
      accessorMode: 'none',
    })

    expect(code).toContain('private int age;')
    expect(code).toContain('private boolean active;')
    expect(code).toContain('private JsonObject profile;')
  })

  it('renders all properties as fields for strategy all', () => {
    const code = generate(`{
      "title": "User",
      "type": "object",
      "properties": {
        "id": { "type": "string" },
        "email": { "type": "string" }
      }
    }`, {
      fieldStrategy: 'all',
      accessorMode: 'none',
    })

    expect(code).toContain('private String id;')
    expect(code).toContain('private String email;')
    expect(code).not.toContain('getEmail("email")')
    expect(code).not.toContain('public String getEmail() {')
  })

  it('renders only required properties as fields for strategy required', () => {
    const code = generate(`{
      "title": "User",
      "type": "object",
      "required": ["id"],
      "properties": {
        "id": { "type": "string" },
        "email": { "type": "string" }
      }
    }`, {
      fieldStrategy: 'required',
      accessorMode: 'none',
    })

    expect(code).toContain('private String id;')
    expect(code).not.toContain('private String email;')
    expect(code).toContain('public String getEmail() {')
    expect(code).toContain('return getString("email");')
    expect(code).toContain('put("email", email);')
  })

  it('renders all properties as JsonObject-backed properties for strategy none', () => {
    const code = generate(`{
      "title": "User",
      "type": "object",
      "properties": {
        "name": { "type": "string" },
        "profile": {
          "type": "object",
          "properties": {
            "nickname": { "type": "string" }
          }
        }
      }
    }`, {
      fieldStrategy: 'none',
      accessorMode: 'lombok',
    })

    expect(code).not.toContain('private String name;')
    expect(code).toContain('public String getName() {')
    expect(code).toContain('return getString("name");')
    expect(code).toContain('public Profile getProfile() {')
    expect(code).toContain('return get("profile", Profile.class);')
    expect(code).toContain('public void setProfile(Profile profile) {')
    expect(code).toContain('put("profile", profile);')
  })

  it('uses specific JsonObject APIs when available and typed get(Class) otherwise', () => {
    const code = generate(`{
      "title": "Event",
      "type": "object",
      "properties": {
        "count": { "type": "integer" },
        "startedAt": { "type": "string", "format": "date-time" },
        "amount": { "type": "number" }
      }
    }`, {
      fieldStrategy: 'none',
      accessorMode: 'none',
      integerMapping: 'int',
      dateTimeMapping: 'LocalDateTime',
      numberMapping: 'BigDecimal',
    })

    expect(code).toContain('public int getCount() {')
    expect(code).toContain('return getInt("count", 0);')
    expect(code).toContain('public LocalDateTime getStartedAt() {')
    expect(code).toContain('return get("startedAt", LocalDateTime.class);')
    expect(code).toContain('public BigDecimal getAmount() {')
    expect(code).toContain('return getBigDecimal("amount");')
  })

  it('uses dedicated JsonObject APIs for boxed primitives and collections when available', () => {
    const code = generate(`{
      "title": "Envelope",
      "type": "object",
      "properties": {
        "total": { "type": "integer" },
        "enabled": { "type": "boolean" },
        "attrs": { "type": "object" },
        "tags": {
          "type": "array",
          "items": { "type": "string" }
        }
      }
    }`, {
      fieldStrategy: 'none',
      accessorMode: 'none',
      integerMapping: 'Long',
      booleanMapping: 'Boolean',
      objectLeafMapping: 'mapObject',
    })

    expect(code).toContain('public Long getTotal() {')
    expect(code).toContain('return getLong("total");')
    expect(code).toContain('public Boolean getEnabled() {')
    expect(code).toContain('return getBoolean("enabled");')
    expect(code).toContain('public Map<String, Object> getAttrs() {')
    expect(code).toContain('return getMap("attrs");')
    expect(code).toContain('public List<String> getTags() {')
    expect(code).toContain('return getList("tags", String.class);')
  })

  it('falls back to fields when property mode is not valid for POJO classes', () => {
    const code = generate(`{
      "title": "Order",
      "type": "object",
      "additionalProperties": false,
      "properties": {
        "id": { "type": "string" }
      }
    }`, {
      modelingStrategy: 'pojo',
      fieldStrategy: 'none',
      accessorMode: 'none',
    })

    expect(code).toContain('public class Order {')
    expect(code).toContain('private String id;')
    expect(code).not.toContain('public String getId() {')
    expect(code).not.toContain('return getString("id");')
  })

  it('lets parsed-property overrides win over the global field strategy', () => {
    const code = generate(`{
      "title": "User",
      "type": "object",
      "properties": {
        "id": { "type": "string" },
        "email": { "type": "string" }
      }
    }`, {
      fieldStrategy: 'none',
      accessorMode: 'none',
    }, {
      '/id': { memberKind: 'field' },
    })

    expect(code).toContain('private String id;')
    expect(code).not.toContain('public String getId() {')
    expect(code).not.toContain('private String email;')
    expect(code).toContain('public String getEmail() {')
  })
})
