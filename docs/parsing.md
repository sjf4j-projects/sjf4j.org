# Parsing (Codec)

`Sjf4j` provides a unified set of entry-point APIs,
allowing data to move consistently between:

- JSON / YAML / Properties
- Raw nodes (Map, List, String, Number, Boolean, null)
- Typed nodes (POJO, JOJO, JAJO)
- OBNT representations

## Conversion APIs

### `fromJson()` / `toJson()`
From JSON
```java
Object node = Sjf4j.fromJson(json);
// Default: parsed into raw nodes (Map/List/String/Number/Boolean/null)

JsonObject jo = Sjf4j.fromJson(json, JsonObject.class);
// Parsed as JsonObject, equivalent to `JsonObject.fromJson(json)`

User user = Sjf4j.fromJson(json, User.class);
// Parsed into POJO or JOJO

Map<String, Object> map =
        Sjf4j.fromJson(json, new TypeReference<Map<String, Object>>() {});
// Supports deep generics via TypeReference
```
To JSON
```java
String json = Sjf4j.toJsonString(node);

byte[] bytes = Sjf4j.toJsonBytes(node);

Sjf4j.toJson(out, node);
```


### `fromYaml()` / `toYaml()`
Semantically identical to JSON conversion.
```java
Object node = Sjf4j.fromYaml(yaml);

String yaml2 = Sjf4j.toYamlString(node);
```

### `fromProperties()` / `toProperties()`
Converts between hierarchical data and flat property structures.
```java
Object node = Sjf4j.fromProperties(properties);

Properties properties2 = Sjf4j.toProperties(node);
// {"aa":{"bb":[{"cc":"dd"}]}} → aa.bb[0].cc=dd
```

### `fromNode()` / `deepNode()`
- `fromNode()` converts one OBNT representation into another.
- `deepNode()` performs a full deep copy.
```java
User user = Sjf4j.fromNode(node, User.class);
// Conversion between node types

User user2 = Sjf4j.deepNode(user);
// Produces a fully detached copy
```

## Custom Node Type
SJF4J allows custom Java types to participate in OBNT.

- For JSON Object → use `POJO` / `JOJO`
- For JSON Array → use `JAJO`
- For JSON Value → use `NodeValue`

### Using `NodeValue`
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
BigDay day = Sjf4j.fromJson("\"2026-01-01\"", BigDay.class);
assertEquals("\"2026-01-01\"", Sjf4j.toJson(day));
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

1. Discriminator on the same object (`scope = SELF`, default)
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

Animal a = Sjf4j.fromJson(
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

ParentZoo z = Sjf4j.fromJson(
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

Poly p1 = Sjf4j.fromJson("{\"a\":1}", Poly.class); // PolyObj
Poly p2 = Sjf4j.fromJson("[1,2,3]", Poly.class);     // PolyArr
```

#### Matching behavior

- `key`: discriminator field name
- `path`: discriminator JSONPath expression (supported in `Scope.SELF`), evaluated only when `key` is not provided
- `when`: accepted discriminator values for one mapping; runtime discriminator values are matched after string conversion
- `scope`: where to resolve discriminator (`SELF` or `PARENT`)
- `onNoMatch`: behavior when no mapping matches (`FAIL` by default, or `FAILBACK_NULL`)

## Performance

SJF4J adds structural semantics on top of underlying codecs, so parsing cost depends on both the backend and the target model.

- In most cases, SJF4J is near native performance in the benchmark suite.
- `PLUGIN_MODULE` is typically the best default when the backend supports it.
- `JOJO` usually keeps a better performance profile than plain `POJO` while preserving typed models.

See [Benchmarks](./benchmarks#json-parsing-benchmark) for parsing results and backend-specific notes.

