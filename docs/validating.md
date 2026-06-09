---
title: "Java JSON Schema Validation"
description: "Validate Java object graphs directly with JSON Schema Draft 2020-12, 2019-09, and Draft-07 using SJF4J's sjf4j-schema APIs and OBNT model."
---

# Validating

SJF4J validates Java object graphs directly through the OBNT model.
Validation works over `Map`, `List`, POJO, JOJO, `JsonObject`, `JsonArray`, and other supported structured nodes without converting them into a separate JSON AST or re-serializing them first.

The `sjf4j-schema` module supports:  

![Draft 2020-12](https://img.shields.io/endpoint?url=https%3A%2F%2Fbowtie.report%2Fbadges%2Fjava-org.sjf4j-sjf4j%2Fcompliance%2Fdraft2020-12.json)

- [JSON Schema Draft 2020-12](https://json-schema.org/draft/2020-12) 
- [JSON Schema Draft 2019-09](https://json-schema.org/draft/2019-09)
- [JSON Schema Draft-07](https://json-schema.org/draft-07)

SJF4J also publishes compliance data through
[Creek Service](https://www.creekservice.org/json-schema-validation-comparison/)
and [Bowtie](https://bowtie.report/#/implementations/java-sjf4j).

## Module Setup

JSON Schema support lives in the separate `sjf4j-schema` module:
```kotlin
implementation("org.sjf4j:sjf4j-schema:<version>")
```
The annotation type `@ValidJsonSchema` is declared in the core annotation package.

## API Overview

These APIs serve different roles:

| API | Primary role | Typical use |
| --- | --- | --- |
| `JsonSchema` | Parsed schema document | Parse schema JSON or convert an existing node into a schema model |
| `SchemaPlan` | Compiled validation plan | Reuse compiled validators across many validation calls |
| `SchemaRegistry` | Shared schema resource store | Index, register, resolve, and lazily compile schema resources used by `$ref` |
| `SchemaDialect` | JSON Schema draft selector | Choose the default draft when a schema does not declare `$schema` |
| `SchemaValidator` | Annotation-driven validation entry point | Validate `@ValidJsonSchema` POJOs with inline schemas, refs, convention lookup, and schema-chain caching |

Typical direct-validation flow:

```text
JsonSchema -> SchemaPlan -> validate object
```

Use `SchemaValidator` when validation should be attached declaratively to Java classes.

## Direct Validation with `JsonSchema`

`JsonSchema` is SJF4J's runtime abstraction of a JSON Schema document.
It follows the JSON Schema specification directly:

- Standard JSON Schema keywords keep their standard meaning.
- Draft-specific keywords are enabled according to the active dialect.
- If you already know JSON Schema, you can usually use `JsonSchema` with the same mental model.

Example: validating a value by `type`.

```java
JsonSchema schema = JsonSchema.fromJson("""
{
    "type": "number"
}
""");

SchemaPlan plan = schema.createPlan();

assertTrue(plan.isValid(1));
assertFalse(plan.isValid("a"));
```

Example: validating object `properties`.

```java
JsonSchema schema = JsonSchema.fromJson("""
{
    "type": "object",
    "properties": {
        "name": {
            "type": "string",
            "minLength": 5
        }
    }
}
""");

SchemaPlan plan = schema.createPlan();

Map<String, Object> map = Map.of("name", "Alice");
assertTrue(plan.isValid(map));                    // Validate a Map

MyPojo pojo = new MyPojo();
pojo.setName("Tom");
assertFalse(plan.isValid(pojo));                  // Validate a POJO
```

### Validation API

Common `SchemaPlan` entry points:

```java
ValidationResult validate(Object node);
// returns a full ValidationResult and collects validation messages

ValidationResult validate(Object node, boolean strictFormat);
// enables strict format assertions when strictFormat is true

ValidationResult validate(Object node, boolean failFast, boolean strictFormat);
// controls both fail-fast behavior and format assertion behavior

boolean isValid(Object node);
boolean isValid(Object node, boolean strictFormat);
// convenience boolean checks with fail-fast semantics

void requireValid(Object node);
void requireValid(Object node, boolean strictFormat);
// throws ValidationException if the value is invalid
```

Example:

```java
SchemaPlan plan = schema.createPlan();

ValidationResult full = plan.validate(node);
ValidationResult failfast = plan.validate(node, true, false);
```

### Choosing a Schema Draft

SJF4J detects the draft from the schema's `$schema` URI when present:

```json
{
    "$schema": "https://json-schema.org/draft/2019-09/schema",
    "type": "object"
}
```

Recognized dialects are represented by `SchemaDialect`:

```java
SchemaDialect.DRAFT_2020_12
SchemaDialect.DRAFT_2019_09
SchemaDialect.DRAFT_07
```

If a schema does not declare `$schema`, the `SchemaRegistry` default dialect is used.
The default registry dialect is `DRAFT_2020_12`.
Use an explicit registry for legacy schemas that omit `$schema`:

```java
SchemaRegistry registry = new SchemaRegistry(SchemaDialect.DRAFT_07);
SchemaPlan plan = schema.createPlan(registry);
```

## Schema References and Registry

SJF4J supports the normal reference model for the active JSON Schema draft.
Common reference forms include:

- same-document `$ref`
- `$defs` / `definitions`
- named fragments from `$anchor` and `$dynamicAnchor`
- Draft 2019-09 recursive references through `$recursiveRef` / `$recursiveAnchor`
- JSON Pointer fragments such as `#/$defs/user`
- external resources registered in a `SchemaRegistry`

### Same-document references

```java
SchemaPlan plan = JsonSchema.fromJson("""
{
    "$defs": {
        "user": {
            "type": "object",
            "properties": {
                "name": { "type": "string" }
            }
        }
    },
    "$ref": "#/$defs/user"
}
""").createPlan();
```

Fragments are resolved as named anchors first, then as JSON Pointer fragments when the fragment starts with `/`.

### External references

External references are resolved from:

1. the currently compiled schema resource,
2. the provided `SchemaRegistry`,
3. SJF4J's built-in global schema registry.

Network URLs such as `https://...` are treated as schema identifiers.
They are not automatically fetched.
If you use `https://...` style `$id` / `$ref`, preload or register the target schemas yourself.

```java
JsonSchema base = JsonSchema.fromJson("""
{
    "$id": "https://example.org/base.json",
    "type": "number"
}
""");

JsonSchema child = JsonSchema.fromJson("""
{
    "$id": "https://example.org/child.json",
    "$ref": "https://example.org/base.json"
}
""");

SchemaRegistry registry = new SchemaRegistry().index(base);
SchemaPlan childPlan = child.createPlan(registry);

assertTrue(childPlan.isValid(1));
assertFalse(childPlan.isValid("a"));
```

### Using `SchemaRegistry`

`SchemaRegistry` stores schema models and compiled plans by absolute URI.
Use it when schemas reference each other, or when shared schema resources should be reused across multiple plan creations.

Important methods:

```java
SchemaRegistry index(JsonSchema schema);
SchemaRegistry index(URI retrievalUri, JsonSchema schema);

SchemaPlan register(JsonSchema schema);
SchemaPlan register(URI retrievalUri, JsonSchema schema);

SchemaPlan resolve(URI uri);
```

Use `index(...)` to make a schema available for later lazy compilation.
Use `register(...)` when you also want the compiled root plan immediately.

When a root schema is loaded from a local file or classpath location, index or register it with an explicit retrieval URI:

```java
SchemaRegistry registry = new SchemaRegistry();
registry.index(URI.create("file:/schemas/root.json"), schema);
```

### Retrieval URI vs canonical URI

SJF4J tracks two URI concepts for schema resources:

- **retrieval URI**: where the root schema document was loaded from, such as `classpath:/json-schemas/user.json` or `file:/tmp/user.json`
- **canonical URI**: the schema resource identity after `$id` resolution; this is the URI used by `$ref` lookups and normal registry registration

Typical flow:

- a schema is loaded from a local URI,
- that local URI becomes the retrieval URI,
- if the schema declares `$id`, SJF4J resolves it against the retrieval URI to get the canonical URI,
- if no `$id` is present, the retrieval URI is promoted as the canonical URI for that root resource.

This distinction matters when a schema is loaded from one place but declares another logical identity.

## Annotation-driven Validation

`SchemaValidator` validates POJOs annotated with `@ValidJsonSchema`.
It resolves one or more compiled plans for a class hierarchy and reuses them from an internal cache.

### Inline schema

```java
@ValidJsonSchema("""
{
    "type": "object",
    "required": ["id"],
    "properties": {
        "id":   { "type": "integer" },
        "user": { "format": "email" }
    }
}
""")
public class Order {
    public int id;
    public String user;
}
```

Validate it:

```java
SchemaValidator validator = new SchemaValidator();
ValidationResult result = validator.validate(new Order());

if (!result.isValid()) {
    result.getErrors().forEach(System.out::println);
}
```

`new SchemaValidator()` uses:

- base schema directory: `classpath:/json-schemas/`
- default dialect: `DRAFT_2020_12`
- fail-fast validation for each plan
- strict format assertions

### Using `ref`

Use `ref` to bind a class to a schema file or a fragment inside a schema resource:

```java
@ValidJsonSchema(ref = "user_dto.json")                 // schema file under the base directory
public class UserDto { ... }

@ValidJsonSchema(ref = "others.json#/$defs/user")       // JSON Pointer into another schema resource
public class UserDto2 { ... }
```

The validator resolves `ref` against its configured base directory.
Configure a different base directory when needed:

```java
SchemaValidator validator = new SchemaValidator("file:/tmp/json-schemas/", null, true);
```

The local schema loader supports `classpath:` and `file:` URIs.

### Convention-based discovery

If neither `value` nor `ref` is specified, SJF4J tries schema files by class name:

```java
@ValidJsonSchema
public class UserDto3 { ... }
```

Resolution order:

1. `<simple-name>.json`, e.g. `UserDto3.json`
2. `<snake-name>.json`, e.g. `user_dto3.json`

Fragments in `ref` may target named anchors or JSON Pointer locations:

- `user_dto.json`
- `others.json#user`
- `others.json#node`
- `others.json#/$defs/user`

### Loading shared schemas

When multiple schema files reference each other, preload them once with `load(...)`:

```java
SchemaValidator validator = new SchemaValidator("file:/tmp/json-schemas/", null, true);
validator.load("common.json");
validator.load("address.json");
```

This is especially useful when `ref` targets use logical identifiers such as `https://example.org/...` and you want to register the corresponding local schema files up front.

For legacy schemas without `$schema`, provide a registry with the desired default dialect:

```java
SchemaRegistry registry = new SchemaRegistry(SchemaDialect.DRAFT_07);
SchemaValidator validator = new SchemaValidator("file:/tmp/json-schemas/", registry, true);
```

## Working with Java Validation

Use JSON Schema and JSR 380 for different layers:

- **[JSR 380 (Bean / Jakarta Validation)](https://beanvalidation.org/2.0-jsr380/)**: validates Java-domain invariants.
- **[JSON Schema](https://json-schema.org/)**: validates structured data contracts at runtime.

| Concern | JSR 380 | JSON Schema |
| --- | --- | --- |
| Best at | Bean constraints | Document / payload constraints |
| Defined as | Java annotations | Schema document |
| Typical target | Java object state | Incoming / outgoing structured data |
| Strength | Domain rules | Structural and conditional rules |

In practice, SJF4J makes them easy to combine: use JSR 380 for in-model invariants, and JSON Schema for external or runtime data contracts.

## Performance Notes

In local Bowtie draft benchmarks, SJF4J consistently ranks among the top-performing Java implementations.
See [Benchmarks](https://sjf4j.org/docs/benchmarks#json-schema-validation-benchmark).

This performance is primarily due to direct validation over native object graphs, avoiding:

- re-serialization,
- re-parsing,
- intermediate tree construction.

Because validation operates directly on OBNT, it also shares structural semantics with `JsonPath` and `JsonPatch`, including declared vs dynamic `JOJO` fields.

## Generating Java from JSON Schema

If you need to generate Java models from JSON Schema, use the online [SJF4J Generator](https://sjf4j.org/generator).

The generator helps bootstrap Java types from a schema definition.
