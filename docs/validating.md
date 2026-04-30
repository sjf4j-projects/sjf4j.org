---
title: "Java JSON Schema Validation"
description: "Validate Java object graphs directly with JSON Schema Draft 2020-12 using SJF4J's JsonSchema APIs and OBNT model without extra serialization steps."
---

# Validating (JSON Schema)

SJF4J offers full support for [JSON Schema Draft 2020-12](https://json-schema.org/) ,
with verified compliance via [Bowtie(SJF4J)](https://bowtie.report/#/implementations/java-sjf4j).  
Validation  **operates directly on OBNT**,
no intermediate JSON serialization or AST conversion is required.

## Overview

These three APIs serve different roles:

| API | Primary role | Typical use |
| --- | --- | --- |
| `JsonSchema` | One schema document at runtime | Parse, compile, and validate against a specific schema |
| `SchemaRegistry` | Shared schema resource store | Register / preload schemas that will be referenced by `$ref` or reused across compilations |
| `SchemaValidator` | Annotation-driven validation entry point | Validate `@ValidJsonSchema` POJOs with convention-based lookup, preload support, and schema-chain caching |

Typical relationship:

- `JsonSchema` is the core runtime validation unit
- `SchemaRegistry` helps multiple schemas resolve each other
- `SchemaValidator` builds on both for class-oriented validation workflows

## Using `JsonSchema`

`JsonSchema` is SJF4J's runtime abstraction of a JSON Schema document.
It follows the JSON Schema specification directly.

In practice, this means:
- Standard JSON Schema keywords keep their standard meaning
- Draft 2020-12 features are exposed as-is
- If you already know JSON Schema, you can use `JsonSchema` directly

Example: validating a value by `type`
```java
JsonSchema schema = JsonSchema.fromJson("""
{
    "type": "number"
}
""");
schema.compile();

assertTrue(schema.isValid(1));
assertFalse(schema.isValid("a"));
```

Example: validating object `properties`
```java
JsonSchema schema = JsonSchema.fromJson("""
{
    "properties": {
        "name": {
            "type": "string", 
            "minLength": 5
        }
    }
}
""");
schema.compile();

Map<String, Object> map = Map.of("name", "Alice");
assertTrue(schema.isValid(map));                    // Validate on Map

MyPojo pojo = new MyPojo();
pojo.setName("Tom");
assertFalse(schema.isValid(pojo));                  // Validate on POJO
```

### Validation API

Common `JsonSchema` entry points:

```java
ValidationResult validate(Object node);
// returns a full `ValidationResult`

ValidationResult validateFailFast(Object node);
// returns as soon as the first validation error is found

boolean isValid(Object node);
// is a convenience boolean check with fail-fast semantics

void requireValid(Object node);
// throws ValidationException if the value is invalid
```

### Schema References (`$ref` / `$dynamicRef`)

SJF4J supports the normal Draft 2020-12 reference model, including:

- `$ref`
- `$dynamicRef`
- `$anchor`
- `$dynamicAnchor`
- JSON Pointer fragments such as `#/$defs/user`

Supported reference patterns include:

- same-document references
- references to anchors inside the same resource
- references to other compiled resources in a `SchemaRegistry`
- local resource loading through `classpath:///...` and `file:///...`

Example:

```java
JsonSchema schema = JsonSchema.fromJson("""
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
""");
schema.compile();
```

Important operational notes:

- external references are resolved from the current compiled schema, then the provided `SchemaRegistry`, then SJF4J's built-in global schema registry
- local loading helpers support `classpath:///` and `file:///`
- network URLs such as `https://...` are treated as **schema identifiers**, not auto-fetched remote documents
- if you use `https://...` style `$id` / `$ref`, preload or register the target schemas yourself in a `SchemaRegistry`


## Using `SchemaRegistry`

`SchemaRegistry` stores compiled schema resources by absolute URI.
Use it when schemas reference each other, or when you want to preload and reuse shared schema resources across multiple validations.

It also sits behind SJF4J's built-in Draft 2020-12 meta-schema resources.

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

SchemaRegistry registry = new SchemaRegistry(base);
child.compile(registry);

assertTrue(child.isValid(1));
assertFalse(child.isValid("a"));
```

You can also register a schema under an explicit alias URI:

```java
SchemaRegistry registry = new SchemaRegistry();
registry.register(URI.create("https://example.org/alias.json"), schema);
```

### Two URIs: retrieval URI vs canonical URI

SJF4J tracks two URI concepts for schema resources:

- **retrieval URI**: where the root schema document was loaded from, such as `classpath:///json-schemas/user.json` or `file:///tmp/user.json`
- **canonical URI**: the schema resource identity after `$id` resolution; this is the URI used by `$ref` lookups and normal registry registration

Typical flow:

- a schema is loaded from a local URI
- that local URI becomes the retrieval URI
- if the schema declares `$id`, SJF4J resolves it against the retrieval URI to get the canonical URI
- if no `$id` is present, the retrieval URI is promoted as the canonical URI for that root resource

This distinction matters when a schema is loaded from one place but declares another logical identity.


## Using `SchemaValidator` and `@ValidJsonSchema`

SJF4J enables declarative schema binding for domain classes.

Annotate a class with `@ValidJsonSchema`, then validate instances using `SchemaValidator`.

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

### Schema discovery and `ref`

The default schema base path is 
```
classpath:///json-schemas/
```
It can be configured if necessary:
```java
SchemaValidator validator = new SchemaValidator("file:///tmp/json-schemas/");
```

Using references via `ref`:
```java
@ValidJsonSchema(ref = "user_dto.json")                 // specify a schema file
public class UserDto { ... }

@ValidJsonSchema(ref = "others.json#/$defs/user")       // JSON Pointer into another schema resource
public class UserDto2 { ... }

@ValidJsonSchema                                        // convention-based lookup
public class UserDto3 { ... }
```

Convention-Based Resolution  
If neither `value` nor `ref` is specified, SJF4J tries:

- `<simple-name>.json`, e.g. `UserDto3.json`
- `<snake-name>.json`, e.g. `user_dto3.json`

Supported schemes:
- `classpath:///`
- `file:///`

When `ref` includes a fragment, SJF4J resolves it in this order:

- anchor
- dynamic anchor
- JSON Pointer (when the fragment starts with `/`)

So these are all valid:

- `user_dto.json`
- `others.json#user`
- `others.json#node`
- `others.json#/$defs/user`

### Preloading shared schemas

When multiple schema files reference each other, it is often convenient to preload them once:

```java
SchemaValidator validator = new SchemaValidator()
        .preload("common.json", "address.json")
        .preloadDirectory("file:///tmp/json-schemas/shared/");
```

This is especially useful when your `ref` targets use logical identifiers such as `https://example.org/...` and you want to register the corresponding local schema files up front.


## Generating Java 

If you need to generate Java models from JSON Schema, use online tool: [SJF4J Generator](https://sjf4j.org/generator)

- **generator** helps bootstrap Java types from a schema definition


## JSON Schema vs JSR 380

Use them for different layers:

- **[JSR 380 (Bean / Jakarta Validation)](https://beanvalidation.org/2.0-jsr380/)**: validates Java-domain invariants
- **[JSON Schema](https://json-schema.org/)**: validates structured data contracts at runtime

| Concern | JSR 380 | JSON Schema |
| --- | --- | --- |
| Best at | Bean constraints | Document / payload constraints |
| Defined as | Java annotations | Schema document |
| Typical target | Java object state | Incoming / outgoing structured data |
| Strength | Domain rules | Structural and conditional rules |

In practice, SJF4J makes them easy to combine: use JSR 380 for in-model invariants, and JSON Schema for external or runtime data contracts.


## Performance
In local Bowtie draft 2020-12 benchmarks,
SJF4J consistently ranks among the top-performing Java implementations.
(See [Benchmarks](https://sjf4j.org/docs/benchmarks#json-schema-validation-benchmark))

This performance is primarily due to its direct validation over native object graphs, avoiding:
- Re-serialization
- Re-parsing
- Intermediate tree construction


## Validation in the OBNT Model

Most JSON tooling assumes:

> JSON text is primary. Objects are derived.

SJF4J treats structured data as primary:

> Objects are primary. JSON is a representation.

Since validation operates directly on OBNT:
- No AST conversion layer is introduced
- Works uniformly across all node kinds
- Shares semantics with `JsonPath` and `JsonPatch`
- Preserves declared vs dynamic `JOJO` fields

Validation is therefore a structural capability of OBNT,
not a separate JSON-processing pipeline.
