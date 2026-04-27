---
title: Generate Java from JSON Schema
description: Browser-based playground for turning JSON Schema into Java scaffolding.
aside: false
outline: false
sidebar: false
docFooter: false
prev: false
next: false
pageClass: generator-page
---

<SchemaToJavaPlayground />

## Generation Rules

> Draft v2026-04-20. These rules define the current baseline and regression target, and should be sufficient for an AI to reproduce an equivalent generation tool.

### 1. Input contract

- Input must be valid JSON.
- Top-level schema must be a JSON object.
- The playground accepts one main schema plus zero or more schema-library documents.
- Schema-library documents are identified by their own `$id` values.
- Relative external `$ref` targets are resolved against the current document `$id` when that `$id` is a URI-like base.
- If `className` is empty, the generator uses `schema.title`; otherwise it uses the explicit override.
- If neither is available, the fallback class name is `GeneratedType`.

### 2. Current baseline mappings

| JSON Schema shape              | Java type baseline                                             |
|--------------------------------|----------------------------------------------------------------|
| `string`                       | `String`                                                       |
| `string` + `format: date`      | `LocalDate`                                                    |
| `string` + `format: date-time` | `OffsetDateTime`, `LocalDateTime`, `Instant`, `String` |
| `integer`                      | `int`, `Integer`, `long`, `Long`, `BigInteger`      |
| `number`                       | `double`, `Double`, `BigDecimal`, `int`, `long`     |
| `boolean`                      | `boolean`, `Boolean`                                |
| `enum`                         | Java enum, `String`                                 |
| `object` leaf                  | `JsonObject`, `Map<String, Object>`, `JOJO`         |
| `object` nested                | `JOJO`, `POJO` |
| `array<T>`                     | `List<T>`                                                     |
| unsupported / unknown          | `Object`                                                      |

### 3. Rendering baseline

- Root `properties` are rendered in schema declaration order. Whether a property becomes a Java field or a JsonObject-backed property depends on field-generation rules and per-property overrides.
- Nested object schemas are rendered as `public static` inner classes inside the containing class unless `modelingStrategy = pathOnly`; no separate Java files are generated for nested objects.
- Imports are deduplicated and sorted lexicographically.
- `packageName` is emitted only when non-empty.
- When validation is enabled, selected validation annotations are generated from supported schema constraints in the current baseline:
  - `@NotNull` from `required`
  - `@Size` from `minLength` / `maxLength` and `minItems` / `maxItems`
  - `@Pattern` from `pattern`
  - `@Min` / `@Max` from integral `minimum` / `maximum`
- JavaDoc comes from `description` or `title`, depending on the selected option.
- Accessors currently support three modes: Lombok annotations, explicit getter/setter methods, or no generated accessors.
- When `accessorMode = lombok`:
  - `JOJO` classes use `@Getter` and `@Setter`
  - `POJO` classes use `@Data`
  - No other Lombok annotations are generated in the current baseline.

### 4. JSON shape in JavaDoc

- Every generated root class includes a simplified `JSON shape` block in JavaDoc.
- The JSON shape describes payload structure, not full schema semantics.
- It includes object nesting, arrays, primitive kinds, string formats, and string-enum summaries.
- It intentionally omits validation details, `required`, `allOf`, `$ref`, and other schema-level metadata.
- Nested inner classes do not repeat the `JSON shape` block in the current baseline.

### 5. Modeling strategy

- `additionalProperties` defaults to `true` when omitted.
- `modelingStrategy` supports three modes:
  - `jojo`
  - `pojo`
  - `pathOnly` (UI label: `Path only (JsonObject preferred)`)
- In `jojo` mode, every generated object class is a `JOJO`, meaning the class extends `org.sjf4j.JsonObject`.
- In `pojo` mode:
  - if an object has `additionalProperties: true` (or omits the keyword), it is generated as a `JOJO`
  - if an object has `additionalProperties: false`, it is generated as a plain `POJO` and does not extend `JsonObject`
- In `jojo` mode, if an object has `additionalProperties: false`, it is still generated as a `JOJO`, but with `@NodeBinding(readDynamic = false)` to disable dynamic reads of undeclared properties.
- In `pathOnly` mode:
  - only the root object is materialized as a generated class
  - the root class is always generated as a `JOJO`
  - descendant object schemas do not generate inner classes
  - root direct object properties with nested `properties` default to `JsonObject`
  - root direct arrays of object default to `List<JsonObject>`
  - descendant object-valued paths use `JsonObject` for path accessor typing
- Scope: `jojo` and `pojo` rules apply to all generated object classes, including nested objects; `pathOnly` suppresses descendant object-class generation entirely.

### 6. Field generation

- `All`: all properties default to `field`.
- `Required Only`: required properties default to `field`; non-required properties default to `property`.
- `None`: all properties default to `property`.
- `property` generation is only valid for `JOJO` classes because property access is backed by `JsonObject` APIs.
- A generated `property` has no backing field. It is rendered as explicit getter/setter methods that read and write through `JsonObject` methods such as `getXxx(key)` and `put(key, value)`.
- Primitive `boolean` getters use JavaBean-style `isXxx()` naming; boxed `Boolean` getters continue to use `getXxx()`.
- Getter generation prefers dedicated `JsonObject` APIs when available (for example `getString(key)`, `getInt(key)`, `getJsonObject(key)`); otherwise it falls back to typed access such as `get(key, LocalDateTime.class)`.
- For `List<T>` properties, getter generation prefers `getList(key, T.class)` when `T` is a concrete non-generic item type; for complex generic item types it falls back to `getList(key)`.
- `property` generation always emits explicit getter/setter methods, even when `accessorMode = lombok` or `accessorMode = none`.
- Per-property settings in **Parsed Properties** override the global field-generation strategy.
- When `modelingStrategy = pathOnly`, field-generation rules apply only to root direct properties.
- In `pathOnly` mode, every non-root property is fixed to `property`: it never generates a field, it is exposed only through root-level path accessors, and it may still expose `type` and `path` configuration in **Parsed Properties** but not field/property switching.
- For nested object properties with their own `properties`, the parsed-property type selector defaults to `JOJO` or `POJO` according to the effective modeling strategy, except under `pathOnly` where root direct object properties default to `JsonObject`.
- If such a nested object property is changed to `JsonObject`, the nested class is not generated and descendant members no longer expose field/property configuration; only eligible root-level by-path getter/setter configuration remains.

### 7. Path accessor generation

- Path accessors are generated only on the root class.
- Root direct members do not generate path accessors.
- Path accessors without index parameters use precompiled `static final JsonPath` constants via `JsonPath.compile(...)` on the root class.
- Path accessors with one or more index parameters continue to use `JsonObject` `*ByPath` APIs and `ensurePutByPath(path, value)` directly.
- Primitive `boolean` path getters use JavaBean-style `isXxx()` naming; boxed `Boolean` path getters continue to use `getXxx()`.
- Getter generation prefers dedicated `*ByPath` APIs when available; otherwise it falls back to typed access such as `getByPath(path, LocalDateTime.class)`.
- For primitive cached-path getters backed by `JsonPath`, generation uses default-value overloads such as `getInt(this, 0)`, `getLong(this, 0L)`, `getDouble(this, 0d)`, and `getBoolean(this, false)` instead of manual null checks.
- Path setter generation uses `ensurePut` semantics so missing intermediate containers are created when needed.
- For `List<T>` path accessors, getter generation prefers `getListByPath(path, T.class)` when `T` is a concrete non-generic item type; for complex generic item types it falls back to `getListByPath(path)`.
- Eligible descendant paths use flattened method names such as `getCustomerEmail()` and `setCustomerEmail(String value)`.
- If a path contains arrays, one `int` index parameter is generated for each array segment, in path order, for example `getItemsSku(int itemsIndex)` or `getGroupsUsersName(int groupsIndex, int usersIndex)`.
- Path accessors require the root class to be a `JOJO`; if the root class is generated as a `POJO`, no path accessors are emitted.
- Per-property settings in **Parsed Properties** can enable or disable root path methods for eligible descendant paths.
- When `modelingStrategy = pathOnly`, root-level path accessors are the only generated access surface for non-root properties.
- In `pathOnly` mode, object-valued descendant paths may also generate path accessors, using `JsonObject`.
- In `pathOnly` mode, descendant property JavaDoc is attached to the generated path getter method.

### 8. Enum generation

- The current baseline supports `javaEnum` generation for string enums only.
- Generated enums are nested inside the class that owns the property unless `modelingStrategy = pathOnly` removes that owning nested class; no separate Java files are generated for enums.
- Enum constants use normalized `UPPER_SNAKE_CASE` names.
- If normalization produces duplicates, numeric suffixes are appended to keep names unique.
- Generated enums keep only constant names; no raw-value field, constructor, or custom codec metadata is emitted.
- Enum properties use typed access such as `get(key, StatusEnum.class)` and `getByPath(path, StatusEnum.class)`.
- When `modelingStrategy = pathOnly` removes the owning nested class for an enum property, the enum is hoisted to the root class.
- In `pathOnly` mode, hoisted enum names are derived from the flattened property path, for example `CustomerStatusEnum`.

### 9. allOf normalization

- The current baseline supports `allOf` flattening for object schemas only.
- `allOf` is normalized before type mapping and rendering.
- Local `$ref` values of the form `#/...` are resolved during normalization.
- External `$ref` values such as `common.json#/$defs/Type` are resolved against the current document `$id`, then matched to a supplied schema-library document `$id`.
- Circular local `$ref` chains are rejected with an error.
- Missing external `$ref` document ids are rejected with an error.
- Supported merge behavior:
  - `properties`: merged by property name
    - identical property schemas are preserved as-is
    - compatible object-property definitions are recursively merged as an inner object-level `allOf`, allowing later branches to narrow an earlier `type: object` declaration with nested `properties`, `required`, or `additionalProperties`
    - incompatible property definitions still produce an error instead of guessing
  - `required`: union of all entries
  - `title`: prefer the outer schema, otherwise the first non-empty branch title
  - `description`: prefer the outer schema, otherwise the first non-empty branch description
- `additionalProperties`: `false` wins; otherwise compatible schema values are preserved, or `true` when explicitly enabled
- Nested object schemas may also use `allOf`; they are rendered as inner classes after normalization unless `modelingStrategy = pathOnly` suppresses descendant class generation.
- Conflicting definitions for the same property name produce an error instead of guessing when they cannot be reconciled through object-schema narrowing.
- Non-object `allOf` composition is not supported in the current baseline.

### 10. Determinism and diagnostics

- Imports are sorted lexicographically and deduplicated.
- Fields, properties, nested enums, and nested inner classes preserve schema declaration order after normalization.
- `required` values merged from `allOf` are emitted in first-seen order.
- Path accessor methods are emitted in schema traversal order.
- Enum constants preserve source enum value order after normalization.
- Enum constant name collisions are resolved by appending numeric suffixes such as `_2`, `_3`, and so on.
- Property-definition conflicts in `allOf` are hard errors.
- Circular local `$ref` chains are hard errors.
- Duplicate schema-library `$id` values are hard errors.
- Missing external `$ref` document ids are hard errors.
- Unsupported non-object `allOf` composition is a hard error.
- Other unsupported or unrecognized schema keywords are ignored in the current baseline unless a rule explicitly states otherwise.

### 11. Smoke-test regression scope

The first regression suite locks down these behaviors:

- invalid JSON / invalid top-level schema handling
- class-name resolution
- a stable single-file happy path (`simple-order`)
- nested object inner-class generation
- `pathOnly` generation without nested inner classes
- nested field-path discovery for object and array shapes
- path accessor generation on the root JOJO class
- nested enum generation and typed enum access
- `pathOnly` enum hoisting and typed path access
- object allOf flattening, object-property narrowing, and conflict detection
- local `$ref` expansion and schema-library `$id`-based external `$ref` resolution

### 12. Deferred rules to refine next

These are intentionally not frozen yet and will be revised before full implementation:

  - nullable semantics and primitive vs boxed types
  - non-object and non-local `$ref`-based `allOf` composition
  - object leaf mapping semantics when `JOJO` is selected
  - multi-file output layout and filename conventions
