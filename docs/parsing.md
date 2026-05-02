---
title: "Parsing JSON, YAML, and Properties in Java"
description: "Parse, serialize, and convert JSON, YAML, Java Properties, POJO, JOJO, and OBNT node structures through SJF4J's unified codec APIs."
---

# Parsing (JSON/YAML/...)

`Sjf4j` provides a unified set of entry-point APIs,
allowing data to move consistently between:

- JSON / YAML / Properties
- Raw nodes (Map, List, String, Number, Boolean, null)
- Typed nodes (POJO, JOJO, JAJO)
- OBNT representations

## Conversion APIs

This section focuses on the core `from...` / `to...` APIs for parsing, serialization, and cross-format conversion.

### `fromJson()` / `toJson()`
From JSON
```java
Sjf4j sjf4j = new Sjf4j();
// Create a reusable Sjf4j instance for data parsing operations

Object node = sjf4j.fromJson(json);
// Default: parsed into raw nodes (Map/List/String/Number/Boolean/null)

JsonObject jo = sjf4j.fromJson(json, JsonObject.class);
// Parsed as JsonObject, equivalent to `JsonObject.fromJson(json)`

User user = sjf4j.fromJson(json, User.class);
// Parsed into POJO or JOJO

Map<String, Object> map =
        sjf4j.fromJson(json, new TypeReference<Map<String, Object>>() {});
// Supports deep generics via TypeReference
```
To JSON
```java
String json = sjf4j.toJsonString(node);

byte[] bytes = sjf4j.toJsonBytes(node);

sjf4j.toJson(output, node);
```


### `fromYaml()` / `toYaml()`
Semantically identical to JSON conversion.
```java
Object node = sjf4j.fromYaml(yaml);

String yaml2 = sjf4j.toYamlString(node);
```

### `fromProperties()` / `toProperties()`
Converts between hierarchical data and flat property structures.
```java
Object node = sjf4j.fromProperties(properties);

Properties properties2 = sjf4j.toProperties(node);
// {"aa":{"bb":[{"cc":"dd"}]}} → aa.bb[0].cc=dd
```

## Building `Sjf4j`

Use `new Sjf4j()` for framework defaults, `Sjf4j.global()` for the shared process-wide runtime, and `Sjf4j.builder()` when you need an isolated runtime with custom behavior.

### Creating a runtime

```java
Sjf4j sjf4j = new Sjf4j();          // Default instance
Sjf4j sjf4j2 = Sjf4j.global();      // Shared global instance

Sjf4j sjf4j3 = Sjf4j.builder()
        .jsonFacadeProvider(Jackson3JsonFacade.provider(new JsonMapper()))
        .build();                   // Custom configuration
```

### `Sjf4j.builder()` options

| Builder method | Purpose | Typical usage |
| --- | --- | --- |
| `jsonFacadeProvider(...)` | Select the JSON backend for this runtime. | `Jackson2JsonFacade.provider(...)`, `Jackson3JsonFacade.provider(...)`, `GsonJsonFacade.provider()`, `Fastjson2JsonFacade.provider()`, `SimpleJsonFacade.provider()` |
| `yamlFacadeProvider(...)` | Override the YAML backend. | `SnakeYamlFacade.provider()` |
| `propertiesFacadeProvider(...)` | Override the Java `Properties` facade. | Usually only needed for custom implementations. |
| `nodeFacadeProvider(...)` | Override the in-memory node binding/conversion facade. | Usually only needed for custom implementations. |
| `streamingMode(...)` | Control which streaming path the runtime prefers. | `AUTO`, `SHARED_IO`, `EXCLUSIVE_IO`, `PLUGIN_MODULE` |
| `defaultValueFormat(type, format)` | Set the default named `ValueCodec` format for a value type in this runtime. | `defaultValueFormat(Instant.class, "epochMillis")` |
| `includeNulls(boolean)` | Control whether JSON serialization keeps `null` object properties. | `includeNulls(false)` |

Example:

```java
Sjf4j sjf4j = Sjf4j.builder()
        .jsonFacadeProvider(Jackson2JsonFacade.provider(new ObjectMapper()))
        .streamingMode(StreamingContext.StreamingMode.PLUGIN_MODULE)
        .defaultValueFormat(Instant.class, "epochMillis")
        .includeNulls(false)
        .build();
```

To derive a new runtime from an existing one, use `Sjf4j.builder(existingSjf4j)`.
It copies the current provider, streaming, value-format, and null-handling settings before you override them.

## Node Conversion and Copying

### `fromNode()` / `bindNode()` / `deepNode()`
- `fromNode()` converts one OBNT representation into another, with isolated nested results.
- `bindNode()` binds an existing node into another target type without forcing a deep copy.
- `deepNode()` performs a full deep copy.
```java
User user = sjf4j.fromNode(node, User.class);
// Conversion between node types

User user2 = sjf4j.bindNode(node, User.class);
// Binding may reuse nested objects/arrays/maps/lists when allowed

User user3 = sjf4j.deepNode(user);
// Produces a fully detached copy
```

## Custom Node Binding

For POJO / JOJO binding, SJF4J can customize property names, creator selection, naming strategy, access strategy, and JOJO dynamic-property behavior.

### Using `@NodeProperty`

`@NodeProperty` can be used on fields and creator parameters.

- `value`: declares the primary property name
- `aliases`: accepts additional input names during reads
- `valueFormat`: selects a named `ValueCodec` format for that field or parameter

```java
class UserProfile {
    @NodeProperty(value = "user_name", aliases = {"username", "userName"})
    public String name;

    @NodeProperty(valueFormat = "epochMillis")
    public Instant createdAt;
}

UserProfile user = Sjf4j.global().fromJson(
    "{\"username\":\"Ada\",\"createdAt\":1710000000000}",
    UserProfile.class
);
```

### Using `@NodeCreator`

Use `@NodeCreator` on a constructor or static factory method when an object should be created from arguments first, instead of through a no-args constructor plus setters.

Properties consumed by the creator are bound first; remaining writable properties can still be applied afterward.

```java
class User {
    final String name;
    final int age;
    String city;

    @NodeCreator
    User(@NodeProperty("name") String name,
         @NodeProperty("age") int age) {
        this.name = name;
        this.age = age;
    }

    public void setCity(String city) {
        this.city = city;
    }
}

User user = Sjf4j.global().fromJson(
    "{\"name\":\"Ada\",\"age\":18,\"city\":\"Shenzhen\"}",
    User.class
);
// name/age come from the creator, city is applied afterward
```

If a creator parameter does not have an explicit annotation, SJF4J can also bind by Java parameter name when the class is compiled with `-parameters`.

> Java records are supported directly. Their canonical constructor is used automatically, so `@NodeCreator` is usually unnecessary.

### Compatible annotations

SJF4J also recognizes common annotations from other JSON ecosystems during object binding:

- Jackson / Jackson 3
  - `@JsonProperty` → similar to `@NodeProperty("...")`
  - `@JsonAlias` → similar to `@NodeProperty(aliases = {...})`
  - `@JsonCreator` → similar to `@NodeCreator`
- Fastjson2
  - `@JSONField(name = "...")` → similar to `@NodeProperty("...")`
  - `@JSONField(alternateNames = {...})` → similar to `@NodeProperty(aliases = {...})`
  - `@JSONCreator` → similar to `@NodeCreator`

This makes it easy to reuse existing models, or mix SJF4J annotations with framework-specific ones in the same class when needed.


### Using `@NodeBinding`

`@NodeBinding` configures type-level binding behavior for a `POJO` or `JOJO`.
It currently supports: `naming`, `access`, `readDynamic` and `writeDynamic`.

#### `naming` (`NamingStrategy`)

Controls how Java member names are mapped to JSON property names.
Supported strategies:
- `IDENTITY` (default): use the Java member name as-is
- `SNAKE_CASE`: convert camelCase names to snake_case

```java
@NodeBinding(naming = NamingStrategy.SNAKE_CASE)
public class User extends JsonObject {
    private String userName;
    private int loginCount;
}

User user = Sjf4j.global().fromJson(
        """
        {"user_name":"han","login_count":2}
        """,
        User.class
);

assertEquals("han", user.userName);
assertEquals(2, user.loginCount);
assertEquals("han", user.getString("user_name"));
assertNull(user.getString("userName"));
```

Naming precedence (high → low):
- `@NodeProperty` on field or creator parameter
- `@NodeBinding(naming = ...)` on the type
- identity naming (`userName` → `userName`)

#### `access` (`AccessStrategy`)

- `BEAN_BASED` (default):
  - public fields bind directly
  - non-public members bind through bean getters/setters or other explicit binding metadata
- `FIELD_BASED`:
  - non-public fields may also bind directly

Use `FIELD_BASED` when a `POJO` should bind non-public fields directly rather than through bean accessors only.

```java
@NodeBinding(access = AccessStrategy.FIELD_BASED)
class User {
    String userName;
    int loginCount;
}

User user = Sjf4j.global().fromJson(
        """
        {"userName":"han","loginCount":2}
        """,
        User.class
);
```

#### `readDynamic` / `writeDynamic`

These options apply to `JOJO`.

```java
@NodeBinding(readDynamic = false)
class ReadDisabledBook extends JsonObject {
    public int id;
    public String name;
}

@NodeBinding(writeDynamic = false)
class WriteDisabledBook extends JsonObject {
    public int id;
    public String name;
}

ReadDisabledBook readBook = Sjf4j.global().fromJson(
        """
        {"id":1,"name":"a","extra":2}
        """,
        ReadDisabledBook.class
);
assertNull(readBook.get("extra"));

WriteDisabledBook writeBook = Sjf4j.global().fromJson(
        """
        {"id":1,"name":"a","extra":2}
        """,
        WriteDisabledBook.class
);
assertEquals(2, writeBook.getInt("extra"));
assertEquals("{\"id\":1,\"name\":\"a\"}", Sjf4j.global().toJsonString(writeBook));
```

- `readDynamic = true` (default): retain unknown JSON properties as dynamic JOJO properties during reading
- `readDynamic = false`: ignore unknown JSON properties unless they bind to declared fields or properties
- `writeDynamic = true` (default): write dynamic JOJO properties together with declared fields or properties
- `writeDynamic = false`: write only declared fields or properties


## Custom Node Type
SJF4J allows custom Java types to participate in OBNT.

- For JSON Object → use `POJO` / `JOJO`
- For JSON Array → use `JAJO`
- For JSON Value → use `NodeValue`

### Using `@NodeValue`
**Annotate with `@NodeValue`**
```java
@NodeValue    
public static class BigDay {
    private final LocalDate localDate;
    
    public BigDay(LocalDate localDate) {
        this.localDate = localDate;
    }

    @ValueToRaw
    public String valueToRaw() {
        return localDate.toString();
    }

    @RawToValue
    public static BigDay rawToValue(String raw) {
        return new BigDay(LocalDate.parse(raw));
    }

    @ValueCopy
    public BigDay valueCopy() {
        return new BigDay(localDate);
    }
}
```

The type can then be used directly without explicit registration:
```java
BigDay day = Sjf4j.global().fromJson("\"2026-01-01\"", BigDay.class);
assertEquals("\"2026-01-01\"", Sjf4j.global().toJson(day));
```

`@NodeValue` types also participate in `valueFormat` selection when multiple named `ValueCodec` formats are registered for the same logical value type.

**Or register a `ValueCodec`**  
For third-party or JDK types:
```java
NodeRegistry.registerValueCodec(new ValueCodec<LocalDate, String>() {
    @Override
    public Class<LocalDate> valueClass() {
        return LocalDate.class;
    }

    @Override
    public Class<String> rawClass() {
        return String.class;
    }
    
    @Override
    public String valueToRaw(LocalDate node) {
        return node.toString();
    }

    @Override
    public LocalDate rawToValue(String raw) {
        return raw == null ? null : LocalDate.parse(raw);
    }
});
```

Named formats can then be selected at runtime. For example, `Instant` already has built-in `iso` and `epochMillis` formats:

```java
Sjf4j sjf4j = Sjf4j.builder()
        .defaultValueFormat(Instant.class, "epochMillis")
        .build();

Instant instant = Instant.parse("2024-01-01T10:00:00Z");

assertEquals("1704103200000", sjf4j.toJsonString(instant));
assertEquals(instant, sjf4j.fromJson("1704103200000", Instant.class));
```

Use this when one value type needs different wire formats in different runtimes or fields.

Built-in `NodeValue`-style codecs registered by default:

| Java type | Raw node type | Notes / built-in formats |
| --- | --- | --- |
| `URI` | `String` | URI string |
| `URL` | `String` | URL string |
| `UUID` | `String` | Canonical UUID string |
| `Locale` | `String` | BCP 47 language tag |
| `Currency` | `String` | ISO currency code |
| `ZoneId` | `String` | Zone ID, such as `Asia/Shanghai` |
| `Instant` | `String` / `Long` | Default string form; built-in formats: default/`iso`, `epochMillis` |
| `LocalDate` | `String` | ISO-8601 date |
| `LocalDateTime` | `String` | ISO-8601 local date-time |
| `OffsetDateTime` | `String` | ISO-8601 offset date-time |
| `ZonedDateTime` | `String` | ISO-8601 zoned date-time |
| `Duration` | `String` | ISO-8601 duration |
| `Period` | `String` | ISO-8601 period |
| `Path` | `String` | Filesystem path string |
| `File` | `String` | File path string |
| `Pattern` | `String` | Regular-expression pattern |
| `InetAddress` | `String` | Host address string |
| `Date` | `String` | Serialized via `Instant` string |
| `Calendar` | `String` | Serialized via zoned date-time string |

### Using `@AnyOf`

`@AnyOf` enables polymorphic binding by mapping one logical type to multiple concrete types.

It supports three practical patterns:

1. Discriminator on the same object (`scope = CURRENT`, default)
2. Discriminator from parent object (`scope = PARENT`)
3. Fallback by JSON runtime shape (object/array), when no discriminator is provided

#### 1) Discriminator on current object

```java
@AnyOf(key = "kind", value = {
    @AnyOf.Mapping(value = Cat.class, when = "cat"),
    @AnyOf.Mapping(value = Dog.class, when = "dog")
})
class Animal {
    String kind;
    String name;
}

class Cat extends Animal { int lives; }
class Dog extends Animal { int bark; }

Animal a = Sjf4j.global().fromJson(
    "{\"kind\":\"dog\",\"name\":\"Lucky\",\"bark\":3}",
    Animal.class
);
// a is Dog
```

#### 2) Discriminator from parent object

```java
class ParentZoo {
    String kind;

    @AnyOf(
        scope = AnyOf.Scope.PARENT,
        key = "kind",
        value = {
            @AnyOf.Mapping(value = Cat.class, when = "cat"),
            @AnyOf.Mapping(value = Dog.class, when = "dog")
        },
        onNoMatch = AnyOf.OnNoMatch.FAILBACK_NULL
    )
    Animal pet;
}

ParentZoo z = Sjf4j.global().fromJson(
    "{\"kind\":\"cat\",\"pet\":{\"name\":\"Mimi\",\"lives\":9}}",
    ParentZoo.class
);
// z.pet is Cat
```

> `path`-based parent discriminator resolution is currently not supported in streaming mode.

#### 3) No discriminator: bind by JSON shape

```java
@AnyOf(value = {
    @AnyOf.Mapping(PolyObj.class),
    @AnyOf.Mapping(PolyArr.class)
})
interface Poly {}

class PolyObj extends JsonObject implements Poly {}
class PolyArr extends JsonArray implements Poly {}

Poly p1 = Sjf4j.global().fromJson("{\"a\":1}", Poly.class);     // PolyObj
Poly p2 = Sjf4j.global().fromJson("[1,2,3]", Poly.class);       // PolyArr
```

#### Matching behavior

- `key`: discriminator field name
- `path`: discriminator JSONPath expression (supported in `Scope.CURRENT`), evaluated only when `key` is not provided
- `when`: accepted discriminator values for one mapping; runtime discriminator values are matched after string conversion
- `scope`: where to resolve discriminator (`CURRENT` or `PARENT`)
- `onNoMatch`: behavior when no mapping matches (`FAIL` by default, or `FAILBACK_NULL`)

## Performance

SJF4J adds structural semantics on top of underlying codecs, so runtime cost depends on both the selected backend and the target model.

- In most benchmark scenarios, SJF4J performs close to native backend levels.
- `JOJO` usually keeps a POJO-like performance profile while adding open-model flexibility.

See [Benchmarks](./benchmarks#json-parsing-benchmark) for measured results and backend-specific notes.
