---
title: "Java JsonPath, JSON Pointer, and Query APIs"
description: "Navigate, query, and update Java object graphs with RFC 9535 JsonPath, RFC 6901 JSON Pointer, and SJF4J query and mutation APIs."
---

# Navigating
SJF4J provides a unified, JSON-semantic path engine that works on all OBNT nodes.  
It supports two standardized path syntaxes:
- [JSON Path (RFC 9535)](https://www.rfc-editor.org/rfc/rfc9535)
- [JSON Pointer (RFC 6901)](https://www.rfc-editor.org/rfc/rfc6901)


## JsonPath
`JsonPath` represents a parsed, reusable path expression.  
`JsonPath.parse(...)` accepts both JSON Path expressions such as `$.user.role`
and JSON Pointer expressions such as `/user/role`; the syntax is detected automatically.

```java
JsonPath path = JsonPath.parse("$.user.role");

Object role = path.getNode(node);
// Returns the single matched node (or null if no match)
```

**Compile Once, Reuse Many Times**
```java
JsonPath path = JsonPath.parse("$.scores[*]");

List<Integer> scores1 = path.find(node, Integer.class);
List<Integer> scores2 = path.find(jo, Integer.class);
```

### `JsonPath` Method List

`JsonPath` is the reusable path object behind both JSON Path and JSON Pointer navigation.
It provides read, query, mutation, and path-inspection APIs over any OBNT node.

| Category | Methods |
|----------|---------|
| Parse and inspect | `parse()`, `toExpr()`, `toPointerExpr()`, `length()`, `segments()`, `copy()`, `rooted()`, `head()`, `tail()`, `isSinglePut()`, `hasAppend()` |
| Existence checks | `contains()`, `hasNonNull()` |
| Single-node access | `getNode()`, `getString()`, `getNumber()`, `getLong()`, `getInt()`, `getShort()`, `getByte()`, `getDouble()`, `getFloat()`, `getBigInteger()`, `getBigDecimal()`, `getBoolean()` |
| Container/model access | `getJsonObject()`, `getMap()`, `getJsonArray()`, `getList()`, `getArray()`, `getSet()`, `get()` |
| Cross-type access | `getAsString()`, `getAsNumber()`, `getAsLong()`, `getAsInt()`, `getAsShort()`, `getAsByte()`, `getAsDouble()`, `getAsFloat()`, `getAsBigInteger()`, `getAsBigDecimal()`, `getAsBoolean()`, `getAs()` |
| Multi-match query | `find()`, `findAs()` |
| Adaptive evaluation | `eval()`, `evalAs()` |
| Mutation | `add()`, `replace()`, `removeIfPresent()`, `put()`, `putIfParentPresent()`, `ensurePut()`, `ensurePutIfAbsent()`, `compute()` |

### Query API

**Query Semantics**

- `get*()` is strict: exactly one match expected.
- `find*()` always returns a list.
- `eval()` adapts based on match count.
  - If the path ends with a function call, the function result is returned.


| JsonPath Method            | 0 Match         | 1 Match         | &gt;1 Match     |
|----------------------------|-----------------|-----------------|-----------------|
| `get*()` / `getAs*()`      | `null`          | value           | *ERROR*         |
| `find*()` / `findAs*()`    | empty list      | list            | list            |
| `eval()` / `evalAs*()`     | `null`          | value           | list            |
| `eval()` (function at end) | function result | function result | function result |

Strict vs semantic conversion:
- `get*(node)` → strict
- `getAs*(node)` → cross-type conversion

**Single Result**
```java
String json = """
{
    "id": 1,
    "name": "Alice",
    "active": true,
    "tags": ["java", "json"],
    "scores": [95, 88.8, 0.5],
    "user": { "role": "coder"}
}
""";
JsonObject jo = JsonObject.fromJson(json);

String role1 = JsonPath.parse("$.user.role").getString(jo);
String role2 = JsonPath.parse("$.user.role").getAsString(jo);
String role3 = JsonPath.parse("$.user.role").get(jo, String.class);
// They got the same result here
```

**Multiple Results**
```java
List<String> tags = jo.findByPath("$.tags[*]", String.class);

List<Integer> firstTwo = jo.findByPath("$.scores[0:2]", Integer.class);
```

**Eval Result**
```java
int tags = jo.evalByPath("$.tags[*].count()", Integer.class);
```

### Mutation APIs

SJF4J has two families of path mutation APIs:

- `add()`, `replace()`, and `removeIfPresent()` follow JSON Patch-style mutation semantics.
- `put()`, `ensurePut()`, and `compute()` are SJF4J convenience APIs for direct object graph updates.

| API                               | Parent path                     | Object target                                                    | Array index target                                                        | Append target                    | Main use                                                |
|-----------------------------------|---------------------------------|------------------------------------------------------------------|---------------------------------------------------------------------------|----------------------------------|---------------------------------------------------------|
| `add(node, value)`                | Must exist                      | Insert or overwrite member                                       | Insert at index `0..size`                                                 | Append                           | JSON Patch `add` semantics                              |
| `replace(node, value)`            | Must exist                      | Target member must exist                                         | Existing index only                                                       | Not supported                    | JSON Patch `replace` semantics                          |
| `removeIfPresent(node)`           | Missing parent returns no value | Remove member; POJO fields cannot be removed                     | Remove from mutable arrays/lists only                                     | Not supported                    | JSON Patch-style removal                                |
| `put(node, value)`                | Must exist                      | Upsert member                                                    | Replace existing index, or append when `index == size`                    | Append                           | General write/upsert                                    |
| `putIfParentPresent(node, value)` | Missing parent is a no-op       | Same as `put()` if parent exists                                 | Same as `put()` if parent exists                                          | Same as `put()` if parent exists | Optional write when parent already exists               |
| `ensurePut(node, value)`          | Created when possible           | Upsert member                                                    | Replace existing index, or append when creating/appending                 | Append                           | Create missing containers, then write                   |
| `ensurePutIfAbsent(node, value)`  | Created when missing            | Write only when key is missing; present `null` counts as present | Existing index is left unchanged; missing index errors on existing arrays | Append                           | Create missing path without overwriting existing values |
| `compute(node, fn)`               | Matches existing parents only   | Recompute and write each matched member                          | Recompute and write each matched index                                    | Append computed value            | Bulk update matched locations                           |

> **Important**: `add()` is intentionally JSON Patch-style. For an object path such as `$.user.name` or `/user/name`, it writes that object member. To append to an array, target the array append position, for example `$.scores[+]` or `/scores/-`.

**`add(path, value)`**  
- Object member:
  - Missing → inserted
  - Existing → overwritten
- Array:
  - Index in `[0, size]` → inserted 
  - `[+]` in JSON Path or `/-` in JSON Pointer → append to array tail
  - Index > size → ERROR

**`replace(path, value)`**
- Target must exist
- Otherwise → ERROR

**`removeIfPresent(path)`**
- Cannot remove fields in `POJO`
- Cannot remove elements in native `Array` or `Set`

```java
JsonObject jo = JsonObject.fromJson("""
{
  "name": "Bob",
  "scores": [90, 95],
  "active": true
}
""");

JsonPath.parse("$.scores[+]").add(jo, 100);       // append
JsonPath.parse("/name").replace(jo, "Alice");     // target must exist
JsonPath.parse("$.active").removeIfPresent(jo);   // remove target if present
```

Result:
```json
{
  "name": "Alice",
  "scores": [90, 95, 100]
}
```

> **Note**: `add()`, `replace()`, and `removeIfPresent()` follow JSON Patch mutation semantics.

**`put(path, value)`**
- Object member:
  - Missing → inserted
  - Existing → overwritten
- Array:
  - Index in `[0, size - 1]` → overwritten
  - `[size]` or `[+]`(JSON Path) or `/-`(JSON Pointer) → append to array tail
  - Index > size → ERROR

```java
JsonPath.parse("/babies/2").put(jo, JsonObject.of("name", "Baby-3"));
```

**`ensurePut(path, value)`**

- Creates intermediate nodes if necessary
- Write semantics are otherwise the same as `put()`
```java
new JsonObject().ensurePutByPath("$.cc.dd[0]", 100);
```
Result:
```json
{
  "cc": {
    "dd": [100]
  }
}
```
If a segment exists but is null, it is treated as non-navigable and replaced with a container.

**`compute(path, (parent, current) -> ...)`**
- Recomputes values at all matched locations
- Evaluates the function once per matched location
- `parent` is the container of the matched value
- `current` is the existing value at that location (may be `null`)
- The returned value replaces the current value
- Returns the number of locations updated


```java
JsonPath.parse("$..version").compute(jo, (parent, current) -> 
        current != null 
        ? current 
        : Nodes.getInObject(parent, "ver"));
```

### Use Shortcuts

`JsonObject`/`JsonArray`/`JOJO`/`JAJO` provide convenient shortcut methods for using `JsonPath`.  
These methods follow the naming pattern `*ByPath()`.

For example:
```java
JsonPath.parse("$.name").getString(JsonObject.fromJson("{\"name\": \"Alice\"}"));
// Equivalent to:
JsonObject.fromJson("{\"name\": \"Alice\"}").getStringByPath("$.name");
```


## JSON Path Syntax
SJF4J fully supports the [JSON Path (RFC 9535)](https://www.rfc-editor.org/rfc/rfc9535) specification,
including `filters`, `functions`, `descent`, `unions`, `slicing`, `function calls`, and so on.

### Core Syntax

Core JSON Path syntax supported by SJF4J:

| Syntax        | Description                 | Example                    |
|---------------|-----------------------------|----------------------------|
| `$`           | Root                        | `$.name`                   |
| `@`           | Current node (filter only)  | `@.name`                   |
| `.name`       | Object member               | `$.store.book`             |
| `['name']`    | Quoted member               | `$['store']`               |
| `[index]`     | Array index                 | `$.book[0]`                |
| `[*]`         | Wildcard                    | `$.store[*]`               |
| `..`          | Recursive descent           | `$..author`                |
| `[start:end]` | Array slice                 | `$.*.book[1:3]`            |
| `[a,b]`       | Union                       | `$.book[0,-1]`             |
| `[?()]`       | Filter                      | `$..book[?(@.price < 10)]` |
| `.func()`     | Function call (end of path) | `$..book.size()`           |
| `[+]`         | Append (array end)          | `$.book[+]`                |

> **Note**: When a function appears at the end of a path, the function result is returned instead of a node list.

> **Note**: `[+]` is an extension, not part of RFC 9535. It means append and is only valid in mutation contexts such as `add()` or `ensurePut()`.

### Filter Expressions

Use filter expressions when you need to select nodes by value, comparison, or boolean conditions.

| Operator                | Description                    | Example                            |
|-------------------------|--------------------------------|------------------------------------|
| `@`, `$`                | Current / Root path            | `$.a[?(@.b == $.x)]`               |
| `==`, `!=`              | Equality                       | `$..*[?(@.b != 'kilo')].b`         |
| `<`, `<=`, `>`, `>=`    | Numeric comparison             | `$.a[?@>3.5]`                      |
| `&&`, `\|\|`, `!`, `()` | Logical operators and grouping | `$.o[?@>1 && !(@>4)]`              |
| `=~`                    | Full regular expression match  | `$[?@.name =~ /^(alice)_\d{2}$/i]` |

Example:
```java
List<String> cheapBooks = jo.findByPath("$..book[?(@.price < 10)].title", String.class);

JsonObject subNode = JsonPath.parse("$[?(@.name =~ /^B/)]").getJsonObject(jo);

Integer cnt = jo.evalByPath("$.a[?@>3.5].count()", Integer.class);
```

### Built-in Functions  

SJF4J provides built-in functions for common counting, aggregation, matching, and value-extraction scenarios.

| Function             | Description                                                               | Example                           |
|----------------------|---------------------------------------------------------------------------|-----------------------------------|
| `length()`           | String/array/object length                                                | `$[?length(@.authors) >= 5]`      |
| `count()`            | Node list size                                                            | `$[?count(@.*.author) >= 5]`      |
| `sum()` / `avg()`    | Numeric aggregation                                                       | `$[?sum(@.price) < 20]`           |
| `min()` / `max()`    | Aggregation                                                               | `$[?min(@.price) > 3]`            |
| `first()` / `last()` | Array selection                                                           | `$[?first(@.title) =~ /^J/]`      |
| `match()`            | [I-Regex (RFC 9485)](https://datatracker.ietf.org/doc/html/rfc9485) match | `$[?match(@.date, "1974-05-..")]` |
| `search()`           | I-Regex contains                                                          | `$[?search(@.author, "[BR]ob")]`  |
| `value()`            | Extract value from NodesType                                              | `$[?value(@..color) == "red"]`    |

> In filter context, functions operate on the result of the inner path expression.

### Define custom functions

If the built-in functions are not enough, you can register your own functions and call them from path expressions.

Custom functions can be registered globally via `FunctionRegistry`:
```java
FunctionRegistry.register(
    new FunctionRegistry.FunctionDescriptor("hi", args -> {
        return "hi, " + Arrays.toString(args);
    })
);

String result = jo.evalByPath("$.hi()", String.class);
```

## JsonPointer

[JSON Pointer (RFC 6901)](https://www.rfc-editor.org/rfc/rfc6901) syntax:

- Must start with `/`
- Direct navigation only, no `filters`, `wildcards`, or `functions`
- `/-` means append and is only valid in mutation contexts such as `add()` or `ensurePut()`
- Escape rules:
  - `~` → `~0`
  - `/` → `~1`

`JsonPointer` shares the same evaluation and mutation APIs as `JsonPath`,
but only accepts RFC 6901 pointer expressions.

```java
JsonPointer.parse("/scores/2").removeIfPresent(jo);

String s = jo.getStringByPath("/scores/3");
```


## NodeStream

`NodeStream` enables declarative, pipeline-style processing on OBNT.

If you already know JDK 8 `Stream`, the mental model is almost the same:

- use a path expression to **select** values
- then apply normal stream operations such as `filter`, `map`, `collect`, `findFirst`, and `toList`
- each path-based stage works on the result of the previous stage

In other words, you can think of `NodeStream` as **"JSON/OBNT navigation + Java Stream processing"**.

**`NodeStream` Method List**

| Category | Methods |
|----------|---------|
| Create | `of()` |
| Path stages | `getByPath()`, `asByPath()`, `findByPath()`, `findAsByPath()`, `evalByPath()`, `evalAsByPath()` |
| Stream stages | `filter()`, `map()`, `flatMap()`, `distinct()`, `peek()`, `limit()`, `skip()`, `sorted()` |
| Terminal operations | `count()`, `anyMatch()`, `allMatch()`, `noneMatch()`, `findFirst()`, `findAny()`, `toList()`, `toJsonArray()`, `collect()` |

```java
List<String> tags = NodeStream.of(node)
        .findByPath("$.tags[*]", String.class)
        .filter(t -> t.length() > 3)                    // Same idea as Stream.filter(...)
        .toList();
```

This is similar to first selecting `tags`, then continuing with a normal Java stream pipeline.

**Multi-Stage Evaluation**

Each stage treats the previous stage’s result as the new root.
This is similar to taking the output of one stream step and feeding it into the next step.

```java
int x = jo.stream()
        .findByPath("$..profile", JsonObject.class)     // Primary
        .filter(n -> n.hasNonNull("values"))
        .getByPath("$.x", Integer.class)                // Secondary
        .findFirst()
        .orElse(4);
```

Here, `findByPath("$..profile", ...)` finds all matching `profile` objects first.
Then `getByPath("$.x", ...)` reads `x` from each matched profile object, just like a follow-up transformation step.

**Programmatic Aggregation**

```java
double avgScore = jo.stream()
        .findByPath("$.scores[*]", Double.class)
        .map(d -> d < 60 ? 60 : d)                      // Same idea as Stream.map(...)
        .collect(Collectors.averagingDouble(s -> s));
```

Use this style when path syntax is good for navigation, but Java code is clearer for business rules,
normalization, or aggregation.


## @CompiledPath 
Every runtime path evaluation involves parsing, tokenization, navigation, and interpretation.   
For occasional queries, that overhead is negligible.   
For hot paths executed millions of times, it becomes measurable.

`@CompiledPath` eliminates that overhead entirely.

By adding `sjf4j-processor`, SJF4J validates JSONPath expressions at build time and generates direct Java accessors. 
At runtime, path operations execute as ordinary Java code—without parsing, interpretation, or reflection.  
In [APT-based Benchmarks](./benchmarks#apt-based-compiledpath) , 
compiled accessors are often **several to dozens of times faster** than dynamic path evaluation.


### Add `sjf4j-processor`

Gradle:
```groovy
dependencies {
    implementation("org.sjf4j:sjf4j:{version}")
    annotationProcessor("org.sjf4j:sjf4j-processor:{version}")
}
```
See [Choose Your Setup](./architecture#sjf4j-processor) for Maven configuration.

### Method Rules
A compiled path method is simply a Java method whose signature describes a JSONPath operation.

```text
┌─────────────────────────────────────────────┐
│ ReturnType method(root, params..., value?)  │
└─────────────────────────────────────────────┘
                    │         │         │
                    │         │         └─ Value to write
                    │         │            (@PutByPath, @EnsurePutByPath)
                    │         │
                    │         └─ Path parameters
                    │            ({idx}, {name}, ...)
                    │
                    └─ Root object
```

For example:
```java
@CompiledPath
interface UserPath {
    @GetByPath("$.profile.name")
    String getName(User user);

    @GetByPath("$.friends[{idx}].name")
    String friendName(User user, int idx);

    @PutByPath("$.settings.theme")
    String theme(User user, String value);
}
```

The generated implementation is obtained through:
```java
UserPath path = CompiledNodes.of(UserPath.class);

// path.getName(user);
// path.friendName(user, 3);
// path.theme(user, "black");
```

**Common Rules:**
- Unsupported paths fail at compile time.
- The first parameter is always the `root` object.
- For write operations, the last parameter is the `value` to write.
- Path placeholders such as `{idx}` and `{name}` are bound to method parameters.
  - `int` parameters address array or list indexes.
  - `String` parameters address object keys.
- Return type
  - No automatic type conversion is performed (only standard Java boxing and unboxing).
  - Type mismatches fail at compile time.
  - Missing `reference-type` results return `null`.
  - Missing `primitive` results fail because absence cannot be represented.
  - Write methods may return `void` or a value type.
    - `void` indicates that the previous value is ignored.
    - A non-void return type returns the previous value at the target location.

### Read Operations

#### `@GetByPath`
Reads a single value from the object graph.

```java
record User(long id, Profile profile, List<Order> orders, Map<String, Object> settings) {}
record Profile(String name, Address address) {}
record Address(String city) {}
record Order(String id, List<Item> items) {}
record Item(String sku, int quantity) {}

@CompiledPath
interface UserPath { 
    @GetByPath("$.id") 
    long id(User user);

    @GetByPath("$.profile.address.city")
    String city(User user);

    @GetByPath("$.orders[{orderIndex}].items[{itemIndex}].sku")
    String itemSku(User user, int orderIndex, int itemIndex);

    @GetByPath("$.settings[{key}]")
    Object setting(User user, String key);
    
    @GetByPath("$.orders[-1].id")
    String lastOrderId(User user);
}
```

For example, the generated implementation for `city(...)` is similar to:
```java
    // Generated by SJF4J
    @Override
    public String city(User root) {
        if (root == null) return null;
        Profile o_profile = root.profile();
        if (o_profile == null) return null;
        Address o_address = o_profile.address();
        if (o_address == null) return null;
        return o_address.city();
    }
```

The generated implementation is ordinary Java code. No reflection, no method handles, and no runtime JSONPath parsing.

**Get Rules:**
- The path must resolve to at most one value.
- Multi-target query paths (such as `*`, `..`) are rejected at compile time.
- Negative array indexes are supported. For example, `[-1]` selects the last element.
- Missing reference-type results return null.
- Missing primitive results fail because absence cannot be represented.
- Return types must match the target value type.


#### `@FindByPath` 
Reads multiple values from the object graph and returns them as `List<T>`.

- The processor
can generate direct code for supported path shapes such as root, wildcards,
slices, and static name/index unions. Filters and recursive descent require
explicit fallback:

```java
@CompiledPath
interface ItemPaths {
    @FindByPath("$.items[*].name")
    List<String> itemNames(Container root);
  
    @FindByPath("$.metadata['version','missing','author','nullable']")
    List<Object> metadataFields(Container root);
  
    @FindByPath("$.items[2,0].name")
    List<String> itemNamesByIndexUnion(Container root);

    @FindByPath("$.items[0:2].name")
    List<String> firstTwoItemNames(Container root);
  
    @FindByPath(value = "$.items[?(@.age > 18)].name", allowFallback = true)
    List<String> adultNames(Catalog catalog);
}
```

Direct code generation is available for common multi-target path shapes, including:

- Wildcards (`[*]`)
- Slices (`[0:2]`)
- Static name unions (`['a','b']`)
- Static index unions (`[0,2]`)

**Find Rules:**
- Methods must return `List<T>`.
- Filters (`[?()]`) and recursive descent (`..`) require `allowFallback = true`; otherwise compilation fails.
- Result ordering follows normal JSONPath evaluation order.

### Write Operations

SJF4J provides four write annotations with different behaviors when parents are missing or values already exist.

```java
@PutByPath("$.settings.theme")
Object theme(User user, String value);

@PutIfParentPresentByPath("$.settings.locale")
Object locale(User user, String value);

@EnsurePutByPath("$.settings.ui.theme")
Object ensureTheme(User user, String value);

@EnsurePutIfAbsentByPath("$.settings.ui.locale")
Object defaultLocale(User user, String value);
```

**Behavior Comparison**  

The semantics are identical to the corresponding runtime `JsonPath` operations.

| Annotation                  | Parent Missing | Value Exists  | Write Performed          |
|-----------------------------|----------------|---------------|--------------------------|
| `@PutByPath`                | Fail           | Replace       | Always                   |
| `@PutIfParentPresentByPath` | Skip           | Replace       | Only if parent exists    |
| `@EnsurePutByPath`          | Create         | Replace       | Always                   |
| `@EnsurePutIfAbsentByPath`  | Create         | Keep Existing | Only if absent or `null` |


For example, the generated implementation for `ensureTheme(...)` is similar to:
```java
    // Generated by SJF4J
    @Override
    public Object ensureTheme(User root, String value) {
        Objects.requireNonNull(root, "root");
        Map<String, Object> o_settings = root.settings();
        if (o_settings == null) {
            throw new JsonException("Cannot create missing ensure intermediate read-only property 'settings' on User");
        }
        Object o_ui = o_settings.get("ui");
        if (o_ui == null) {
          o_ui = new LinkedHashMap<>();
          o_settings.put("ui", o_ui);
        }
        return Nodes.putInObject(o_ui, "vivo", value);
    }
```

The generated implementation is ordinary Java code. No reflection, no method
handles, and no runtime JSONPath parsing.

**Put Rules**
- The last method parameter is the value to write.
- Methods may return `void` or the previous value at the target location.
- Return types must match the previous value type.
- The root object itself is never created.
- `@Ensure*` annotations may create missing intermediate containers.
- Read-only intermediate properties cannot be created and cause the operation to fail.
- Intermediate containers must be creatable by generated code. Unsupported container types fail at compile time. 
  - Unknown or `Map-typed` object containers are created as `LinkedHashMap`.
  - Array-like containers are created as `ArrayList`.


## JSON Path in the OBNT Model

Unlike traditional JSONPath implementations that operate on a separate JSON AST,
SJF4J applies path navigation directly to OBNT (Object-Based Node Tree) objects.

This means:

- The same path engine works across `Map`, `List`, `POJO`, and `JOJO`
- No intermediate tree conversion is required
- Mutations apply directly to the actual object graph
- Path evaluation integrates naturally with Java Streams

In SJF4J, `JsonPath` and `CompiledPath` are not utilities layered on top of the data model.

They are first-class operations of the OBNT model itself.