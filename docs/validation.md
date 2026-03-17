# Validation (JSON Schema)

SJF4J offers full support for [JSON Schema Draft 2020-12](https://json-schema.org/) ,
with verified compliance via [Bowtie](https://bowtie.report/#/implementations/java-sjf4j).  
In local Bowtie benchmarks against the official test suite,
SJF4J ranks among the fastest Java implementations.

Validation in SJF4J operates directly on OBNT,
no intermediate JSON serialization or AST conversion is required.

## Creating and Using `JsonSchema`
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
assertTrue(schema.isValid(map));                    // Map validated directly

MyPojo pojo = new MyPojo();
pojo.setName("Tom");
assertFalse(schema.isValid(pojo));                  // POJO validated directly
```


## Declarative Validation via `@ValidJsonSchema`

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

### Schema References

Using references via `ref`
```java
@ValidJsonSchema(ref = "domain.schema.json#User")            // $anchor
public class UserDto { ... }

@ValidJsonSchema(ref = "domain.schema.json#/$defs/User")     // JSON Pointer
public class UserDto2 { ... }

@ValidJsonSchema                                             // Convention-based lookup
public class UserDto3 { ... }
```

The default schema base path is 
```
classpath:///json-schemas/
```
It can be configured if necessary:
```java
SchemaValidator validator = new SchemaValidator("file:///tmp/json-schemas/");
```



**Convention-Based Resolution**

If neither `value` nor `ref` is specified:
- find `<fully.qualified.ClassName>.schema.json`
- find `<SimpleName>.schema.json`

Supported schemes:
- `classpath:///`
- `file:///`

Network URLs (e.g. `https://`) are treated as identifiers unless explicitly enabled.


## JSON Schema vs JSR 380 (Jakarta Validation)

Typical separation of responsibilities:
- **[JSR 380 (Bean / Jakarta Validation)](https://beanvalidation.org/2.0-jsr380/)** → Validates **domain invariants** inside the Java model
- **[JSON Schema](https://json-schema.org/)** → Validates **runtime data contracts** for structured data

| Concern               | JSR 380                      | JSON Schema                                |
|-----------------------|------------------------------|--------------------------------------------|
| Primary scope         | Java domain model            | JSON / structured data documents           |
| Configuration         | Annotations embedded in code | External schema documents                  |
| Validation style      | Annotation-based constraints | Declarative schema constraints             |
| Logic capabilities    | Mostly static invariants     | Conditional logic (`if` / `then` / `else`) |
| Structural validation | Limited                      | Rich structural constraints                |
| Deployment model      | Compiled with application    | Runtime-configurable                       |
| Typical usage         | Domain invariants            | Data contracts and policies                |

Together, they may form a layered validation model **spanning domain invariants and runtime data contracts.**


## Performance
In local Bowtie draft 2020-12 benchmarks, 
SJF4J consistently ranks among the top-performing Java implementations. 
(See [Benchmarks](https://sjf4j.org/docs/benchmarks#json-schema-validation-benchmark))

This performance is primarily due to its direct validation over native object graphs, avoiding:
- Re-serialization
- Re-parsing
- Intermediate tree construction


## Why Validation in OBNT

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

