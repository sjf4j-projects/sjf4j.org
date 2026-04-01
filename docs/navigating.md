---
title: "Java JSON Path and JSON Pointer"
description: "Query and mutate Java object graphs with RFC 9535 JSON Path and RFC 6901 JSON Pointer on SJF4J's unified node model."
---

# Navigating (JSON Path)
SJF4J supports two standardized path syntaxes:
- [JSON Path (RFC 9535)](https://www.rfc-editor.org/rfc/rfc9535)
- [JSON Pointer (RFC 6901)](https://www.rfc-editor.org/rfc/rfc6901)

## Path-Based Navigation and Mutation
SJF4J provides a unified, JSON-semantic path engine that works on all OBNT nodes.  


### Use `JsonPath`
`JsonPath` represents a compiled, reusable path expression.

```java
JsonPath path = JsonPath.compile("$.user.role");

Object role = path.getNode(node);
// Returns the single matched node (or null if no match)
```

**Compile Once, Reuse Many Times**
```java
JsonPath path = JsonPath.compile("$.scores[*]");

List<Integer> scores1 = path.find(node, Integer.class);
List<Integer> scores2 = path.find(jo, Integer.class);
```

### Use `JsonObject`

`JsonObject`/`JsonArray`/`JOJO`/`JAJO` provide convenient shortcut methods for using `JsonPath`.  
These methods follow the naming pattern `*ByPath()`.

For example:
```java
JsonPath.compile("$.user.role").getString(jo);

// Equivalent to:
jo.getStringByPath("$.user.role");
```

### Path Evaluation

**Path Evaluation Semantics**

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

String role1 = JsonPath.compile("$.user.role").getString(jo);
String role2 = JsonPath.compile("$.user.role").getAsString(jo);
String role3 = JsonPath.compile("$.user.role").get(jo, String.class);
// They got the same result here
```

**Multiple Results**
```java
List<String> tags = jo.findByPath("$.tags[*]", String.class);

List<Integer> firstTwo = jo.findByPath("$.scores[0:2]", Integer.class);
```

### Mutation APIs

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

**`remove(path)`**
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

JsonPath.compile("$.scores[+]").add(jo, 100);       // append
JsonPath.compile("/name").replace(jo, "Alice");     // target must exist
JsonPath.compile("$.active").remove(jo);            // remove target
```

Result:
```json
{
  "name": "Alice",
  "scores": [90, 95, 100]
}
```

> **Note**: `add()`, `replace()`, and `remove()` follow JSON Patch mutation semantics.

**`put(path, value)`**
- Object member:
  - Missing → inserted
  - Existing → overwritten
- Array:
  - Index in `[0, size - 1]` → overwritten
  - `[size]` or `[+]`(JSON Path) or `/-`(JSON Pointer) → append to array tail
  - Index > size → ERROR

**`putMulti(path, value)`**
- Writes the same value to every matched target location
- Write semantics are otherwise the same as `put()`

```java
JsonPath.compile("/babies/2").put(jo, JsonObject.of("name", "Baby-3"));
JsonPath.compile("$.babies[*].age").putMulti(jo, 9);
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


## JSON Path Syntax
SJF4J fully supports the [JSON Path (RFC 9535)](https://www.rfc-editor.org/rfc/rfc9535) specification,
including `filters`, `functions`, `descent`, `unions`, `slicing`, `function calls`, and so on.

| Syntax        | Description                | Example                    |
|---------------|----------------------------|----------------------------|
| `$`           | Root                       | `$.name`                   |
| `@`           | Current node (filter only) | `@.name`                   |
| `.name`       | Object member              | `$.store.book`             |
| `['name']`    | Quoted member              | `$['store']`               |
| `[index]`     | Array index                | `$.book[0]`                |
| `[*]`         | Wildcard                   | `$.store[*]`               |
| `..`          | Recursive descent          | `$..author`                |
| `[start:end]` | Array slice                | `$.*.book[1:3]`            |
| `[a,b]`       | Union                      | `$.book[0,-1]`             |
| `[?()]`       | Filter                     | `$..book[?(@.price < 10)]` |
| `.func()`     | Function call              | `$..book.size()`           |
| `[+]`         | Append (SJF4J extension)   | `$.book[+]`                |

> Note: When a function appears at the end of a path, the function result is returned instead of a node list.

> Note: `[+]` is an SJF4J extension, not part of RFC 9535. It means append and is only valid in mutation contexts such as `add()` or `ensurePut()`.

**Filter Expressions**

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

JsonObject subNode = JsonPath.compile("$[?(@.name =~ /^B/)]").getJsonObject(jo);

Integer cnt = jo.evalByPath("$.a[?@>3.5].count()", Integer.class);
```

### Built-in Functions  

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

Custom functions can be registered globally via `FunctionRegistry`:
```java
FunctionRegistry.register(
    new FunctionRegistry.FunctionDescriptor("hi", args -> {
        return "hi, " + Arrays.toString(args);
    })
);

String result = jo.evalByPath("$.hi()", String.class);
```

## JSON Pointer

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
JsonPointer.compile("/scores/2").remove(jo);

String s = jo.getStringByPath("/scores/3");
```

## Global Path Cache

SJF4J provides a built-in global cache for compiled JSON Path expressions.

It avoids repeated compilation of identical paths and improves performance
in dynamic but reused query workloads.
```java
JsonPath p1 = JsonPath.compileCached("$.a.b[0].c");
JsonPath p2 = JsonPath.compileCached("$.a.b[0].c");

assertSame(p1, p2);
```
By default, the cache is backed by a `ConcurrentHashMap`.

**Note:** since the cache is unbounded, ensure path expressions are reasonably reused
to avoid excessive memory growth.

For advanced scenarios, the cache strategy can be customized via:
```java
Sjf4jConfig.Builder.pathCache((expr, compiler) -> {...});
```


## Stream-Based Processing

`NodeStream` enables declarative, pipeline-style processing on OBNT.

```java
List<String> tags = NodeStream.of(node)
        .findByPath("$.tags[*]", String.class)
        .filter(t -> t.length() > 3)                    // Programmatic filtering
        .toList();
```

**Multi-Stage Evaluation**

Each stage treats the previous stage’s result as the new root.
```java
int x = jo.stream()
        .findByPath("$..profile", JsonObject.class)     // Primary
        .filter(n -> n.hasNonNull("values"))
        .getByPath("$.x", Integer.class)                // Secondary
        .findFirst()
        .orElse(4);
```

**Programmatic Aggregation**

```java
double avgScore = jo.stream()
        .find("$.scores[*]", Double.class)
        .map(d -> d < 60 ? 60 : d)                      // Custom normalization
        .collect(Collectors.averagingDouble(s -> s));
```

## Why Path in OBNT

SJF4J applies path navigation directly on plain Java objects (OBNT),
instead of operating on a separate JSON AST.  
This means:

- The same path engine works across `Map`, `List`, `POJO`, and `JOJO`
- No intermediate tree conversion is required
- Mutations apply to the actual object graph
- Path evaluation integrates naturally with Java Streams

In SJF4J, `JsonPath` is part of the core structural model,
not an external query layer.

## Performance

SJF4J JsonPath is designed for direct traversal over native Java object graphs with low structural overhead.

- SJF4J delivers fast performance in JMH benchmarks.
- Inside SJF4J, `Map/List` is fastest, `JOJO` is close behind, and plain `POJO` is slower.
- `JOJO` is the best fit when you want typed models with a more JSON-native performance profile.

See [Benchmarks](./benchmarks#json-path-benchmark) for the latest results and methodology.
