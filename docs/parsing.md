---
title: "Parsing JSON, YAML, and Properties in Java"
description: "Parse, serialize, and convert JSON, YAML, Java Properties, POJO, JOJO, and OBNT node structures through SJF4J's unified codec APIs."
---

# Parsing (Codec)

`Sjf4j` provides a unified set of entry-point APIs,
allowing data to move consistently between:

- JSON / YAML / Properties
- Raw nodes (Map, List, String, Number, Boolean, null)
- Typed nodes (POJO, JOJO, JAJO)
- OBNT representations

## Conversion APIs

### Creating `Sjf4j`
Multiple ways to obtain a `Sjf4j` instance:
```java
Sjf4j sjf4j = new Sjf4j();          // Default instance

Sjf4j sjf4j2 = Sjf4j.builder()      
        .jsonFacade(new Jackson3JsonFacade())
        .build();                   // Custom configuration

Sjf4j sjf4j3 = Sjf4j.global();      // Shared global instance
```


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

### `fromNode()` / `deepNode()`
- `fromNode()` converts one OBNT representation into another.
- `deepNode()` performs a full deep copy.
```java
User user = sjf4j.fromNode(node, User.class);
// Conversion between node types

User user2 = sjf4j.deepNode(user);
// Produces a fully detached copy
```

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
        key = "kind",
        scope = AnyOf.Scope.PARENT,
        value = {
            @AnyOf.Mapping(value = Cat.class, when = "cat"),
            @AnyOf.Mapping(value = Dog.class, when = "dog")
        }
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

Poly p1 = Sjf4j.global().fromJson("{\"a\":1}", Poly.class); // PolyObj
Poly p2 = Sjf4j.global().fromJson("[1,2,3]", Poly.class);       // PolyArr
```

#### Matching behavior

- `key`: discriminator field name
- `path`: discriminator JSONPath expression (supported in `Scope.CURRENT`), evaluated only when `key` is not provided
- `when`: accepted discriminator values for one mapping; runtime discriminator values are matched after string conversion
- `scope`: where to resolve discriminator (`CURRENT` or `PARENT`)
- `onNoMatch`: behavior when no mapping matches (`FAIL` by default, or `FAILBACK_NULL`)

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
- `@NodeProperty` on field or constructor parameter
- `@NodeBinding(naming = ...)` on the type
- identity naming (`userName` → `userName`)

#### `access` (`AccessStrategy`)

- `BEAN_BASED` (default): 
  - public fields bind directly; 
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


## Performance

SJF4J adds structural semantics on top of underlying codecs, so runtime cost depends on both the selected backend and the target model.

- In most benchmark scenarios, SJF4J performs close to native backend levels.
- `JOJO` usually keeps a POJO-like performance profile while adding open-model flexibility.

See [Benchmarks](./benchmarks#json-parsing-benchmark) for measured results and backend-specific notes.
