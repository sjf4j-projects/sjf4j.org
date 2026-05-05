---
title: "JSON-Oriented Object Modeling in Java"
description: "Learn SJF4J's Object-Based Node Tree (OBNT), a JSON-oriented object model for Java spanning POJO, JOJO, JAJO, Map, List, arrays, sets, and scalar values."
---

# Modeling

SJF4J represents structured data as an **Object-Based Node Tree (OBNT)**.

## Object-Based Node Tree

Instead of introducing a dedicated AST hierarchy (e.g. `JsonNode`, `JsonElement`),
OBNT uses **plain Java objects as nodes**. Any node in the tree is one of:

- JSON Object → `Map`, `JsonObject`, or a typed object (`POJO` / `JOJO`)
- JSON Array → `List`, `JsonArray`, `JAJO`, native arrays, or `Set`
- JSON Value → `String`, `Number`, `Boolean`, `null`, or `NodeValue`

```mermaid
graph BT
  node(("Object <br/> Based Node Tree"))
  node --> object(("JSON Object <br/> { }"))
    object ---> map("*Map")
    object --> jo("JsonObject")
    object ---> jojo(" &lt;JOJO&gt; <br/> (extends JsonObject)")
    object --> pojo(" &lt;POJO&gt; ")
  node --> array(("JSON Array <br/> [ ]"))
    array ---> list("*List")
    array --> ja("JsonArray")
    array ---> jajo(" &lt;JAJO&gt; <br/> (extends JsonArray)")
    array --> arr("Array")
    array ---> set("Set")
  node --> value(("JSON Value <br/> ..."))
    value --> string("*String")
    value ---> number("*Number")
    value --> boolean("*Boolean")
    value ---> nodeValue("&lt;NodeValue&gt;")
```

### Node Types

**JSON Object `{}`**
- `Map`:  
  A generic key-value representation using standard Java `Map`. 

- `JsonObject`:   
  A lightweight wrapper over a JSON object that provides JSON-semantic APIs.

- `JOJO` (JSON Object Java Object):  
  A hybrid model that extends `JsonObject` while behaving as a typed Java object. It combines:
  - **declared fields** (POJO-style, strongly typed), and
  - **dynamic properties** (JSON-style, preserved as-is)

- `POJO` (Plain Old Java Object):  
  A strongly typed Java object with fields, getters, and setters. 
  Great for stable schemas and business logic.

**JSON Array `[]`**
- `List`   
  A standard Java `List` used as a direct representation of a JSON array.

- `JsonArray`  
  A lightweight wrapper over a JSON array that provides JSON-semantic APIs.

- `JAJO` (JSON Array Java Object)  
  An array type extending `JsonArray`, suitable for domain-specific array models.

- `Array`  
  A native Java array (e.g. `String[]`) used when a fixed-size, strongly typed representation is desired.

- `Set`  
  A Java `Set` mapped to a JSON array for compatibility, with no ordering guarantees.

**JSON Value `...`**
- `String`, `Number`, `Boolean`, `null`  
  JSON primitive values map directly to Java primitives/wrappers.

- `NodeValue`  
  A typed value representation that preserves JSON semantics while enabling
  custom Java type adaptation.   
  (e.g. `LocalDate`, `UUID`)

### Type Identification

OBNT distinguishes between **JSON types** and **node kinds**.

- `JsonType` reflects the standard JSON data model.
- `NodeKind` reflects the OBNT runtime classification.

| JsonType  | NodeKind                                                                       |
|-----------|--------------------------------------------------------------------------------|
| `OBJECT`  | `OBJECT_MAP` / `OBJECT_JSON_OBJECT` / `OBJECT_JOJO` / `OBJECT_POJO`            |
| `ARRAY`   | `ARRAY_LIST` / `ARRAY_JSON_ARRAY` / `ARRAY_JAJO` / `ARRAY_ARRAY` / `ARRAY_SET` |
| `STRING`  | `VALUE_STRING` / `VALUE_STRING_CHARACTER` / `VALUE_STRING_ENUM`                |
| `NUMBER`  | `VALUE_NUMBER`                                                                 |
| `BOOLEAN` | `VALUE_BOOLEAN`                                                                |
| `NULL`    | `VALUE_NULL`                                                                   |
| `*`       | `VALUE_NODE_VALUE`                                                             |

```java
Object node = new HashMap<String, Object>();

JsonType type = JsonType.of(node);      // JsonType.OBJECT
NodeKind kind = NodeKind.of(node);      // NodeKind.OBJECT_MAP
```

**The Raw Nodes**  
When no target type is specified during parsing or transforming,
each JSON type is mapped to its default raw node type:
- `Map<String, Object>` for JSON objects
- `List<Object>` for JSON arrays
- `String`, `Number`, `Boolean`, or `null` for JSON values

### Why OBNT

**1) One set of JSON-semantic APIs for every node**  
SJF4J treats every node as a first-class citizen.  
Traversal, query, patch, and validation can be applied uniformly,
regardless of whether a node is a raw `Map/List`, a `JsonObject/JsonArray`, or a typed domain model.

**2) Focus on business**  
Model your domain in the most natural way for your business.  
All nodes are plain Java objects—they can be stored,
logged, passed through frameworks, and inspected with standard tools.   
No custom AST or special infrastructure is required.


## Node Semantics
All nodes in OBNT share a unified set of JSON-semantic APIs.  
Basic operations are available through:
- Instance methods (`JsonObject`, `JsonArray`)
- The static `Nodes` facade (for raw nodes)

### Access and Conversion
Nodes support both strict access and semantic conversion.

- `toXxx()` performs **type-safe access**  
  (e.g. `Integer → Long`, `Double → Float`)
- `asXxx()` performs **cross-type conversion**  
  (e.g. `String → Number`, `Boolean → String`)

```java
Object node = "123";

Nodes.toString(node);           // -> "123"
Nodes.toInteger(node);          // -> ERROR (strict access)
Nodes.asInteger(node);          // -> 123   (semantic conversion)
```

### Structural Operations
Nodes provide container-level operations for objects:
```java
Nodes.sizeInObject(node);
Nodes.containsInObject(node, "name");
Nodes.getInObject(node, "name");
Nodes.forEachObject(node, (k, v) -> {...});
```
Equivalent APIs exist for arrays.

### Traversal
Nodes can be traversed recursively with path awareness:

```java
Nodes.walk(node, (ps, value) -> {
    log.info("path={}, segment={}, value={}", ps.rootedPathExpr(), ps, value);
    return true;
});
```

### Equality, Inspection and Copying
**Equality** is defined by JSON structure and value, not by Java object identity.
```java
Nodes.equals(node1, node2);
```
**Inspection** produces a readable OBNT representation,
including additional runtime details (e.g. declared vs dynamic fields in JOJO).
```java
System.out.println(Nodes.inspect(node));
```

**Copying** semantics are explicit.
```java
Nodes.copy(node);                         // shallow copy
Sjf4j.global().deepNode(node);          // deep copy
```

### Dynamic Objects with `JsonObject`
`Nodes` provides static APIs for all OBNT nodes.  
`JsonObject` offers a dynamic, instance-based representation for JSON objects.

```java
String json = """
{
    "id": 1,
    "name": "Alice",
    "active": true,
    "tags": ["java", "json"],
    "scores": [95, 88.8, 0.5],
    "user": { "role": "coder" }
}
""";

JsonObject jo = JsonObject.fromJson(json);
// Parse JSON string to JsonObject
```

Accessing properties:
```java
Object node = jo.getNode("id");
// Returns raw node, or null if missing.

Integer id = jo.getInteger("id");
// Strict numeric access.

double id2 = jo.getDouble("id", 0d);
// Returns default if missing or null.

String name = jo.get("name", String.class);
// Explicit typed access.

String name1 = jo.get("name");
// Context-inferred typed access.

String active = jo.getAsString("active");
// Cross-type conversion.

String active2 = jo.getAs("active");
// Dynamic conversion shorthand.
```

Nested operations can be chained naturally:
```java
String role = jo.getJsonObject("user").get("role");
```

Mutating structure:
```java
jo.put("extra", "blabla");
// See also: putNonNull(), putIfAbsent(), computeIfAbsent()

jo.toBuilder().putIfAbsent("x", "xx").put("y", "yy");
// Builder-style chained updates

jo.remove("extra");
// See also: removeIf()
```
> `JsonArray` is the array counterpart of `JsonObject`, providing a similar set of APIs for array nodes.

## Modeling Domain Objects
JSON is flexible, while POJOs are strict.

### Modeling with JOJO
Mapping JSON directly into a POJO often means discarding undeclared fields,
which may reduce the expressive power of the original JSON payload.  

[Jackson](https://github.com/FasterXML/jackson-databind) provides a mechanism to retain extra fields
through a dedicated map (via `@JsonAnySetter`).  
SJF4J approaches this at the modeling level with `JOJO`.

A `JOJO` is simply a class that extends `JsonObject`:
```java
public class User extends JsonObject {
    String name;
    List<User> friends;
}
```

**Parse from JSON**
```java
String json = """
{
    "name": "Alice",
    "friends": [
        {"name": "Bill", "active": true },
        {"name": "Cindy", "friends": [{"name": "David"}]}
    ],
    "age": 18
}
""";
User user = Sjf4j.global().fromJson(json, User.class);
```

**Access declared fields and dynamic properties** 
```java
assertEquals("Alice", user.getName());
// Declared fields can be accessed via getters.

assertEquals("Alice", user.getString("name"));
// Or via JSON-semantic APIs.

assertEquals(18, user.getInteger("age"));
// Dynamic properties are preserved and remain accessible.
```

**Inspect the structure**
```java
System.out.println(user);
// @User{*name=Alice, *friends=[@User{*name=Bill, *friends=null, active=true}, ...], age=18}
//        └─────────────┴─────┬─────────┴────────────┘             └───────────┬──────┘
//                            ↓                                                ↓
//              Declared fields in POJO/JOJO                      Dynamic properties in JOJO
```
- Fields marked with `*` are declared fields.
- Other entries are dynamic properties retained from JSON.

**Use JSON-semantic APIs**  

For example: `findByPath()`
```java
List<String> allFriends = user.findByPath("$.friends..name", String.class);
// ["Bill", "Cindy", "David"] -- all friends and friends of friends.
```



### Modeling with JAJO
JAJO is the array counterpart of JOJO, but unlike JOJO, it does not support additional properties.  
JAJO is intended for modeling, not for extending array structure.

For example, SJF4J's `JsonPatch` is modeled as a specialized `JsonArray`:
```java
public class JsonPatch extends JsonArray {
    // ...
}
```


## How to Choose?

SJF4J gives you more choices.  
That flexibility is powerful, but it also means there are more modeling decisions to make.

### POJO or JOJO

Use this rule first:
- **POJO = closed model**
- **JOJO = open model**

Choose `POJO` when the object is mainly a **Java domain model**.  
Choose `JOJO` when the object sits at a JSON or data boundary and needs both typed members and undeclared properties, 
such as API payloads, config objects, integration models, or SQL result bindings.

> `JOJO` has the same core binding model and practical performance profile as `POJO`, so choosing `JOJO` does **not** mean paying an extra abstraction cost in normal use.


| Prefer               | When                                                                 |
|----------------------|----------------------------------------------------------------------|
| `POJO`               | Stable schema, fixed structure, mainly business/domain logic.         |
| `JOJO`               | Typed structure plus unknown / extensible JSON members.              |
| `JsonObject` / `Map` | Mostly dynamic payloads with little need for a typed Java model.     |

`JOJO` is not simply a "better POJO". It is a different modeling choice.

**Recommended default**
- **Domain core** → prefer `POJO`
- **External boundary (API / config / integration / SQL result)** → prefer `JOJO`
- **Mostly dynamic payloads** → prefer `JsonObject` or `Map`
- **Unsure / evolving schema** → start with `JOJO`

### Field or Property

For `JOJO`, think in two layers:
- **Declared fields = stable contract**
- **Dynamic properties = flexible edges**


| Use Field                 | Use Dynamic Property            |
|---------------------------|---------------------------------|
| important business data   | passthrough / extension data    |
| frequently accessed       | rare or optional data           |
| needs typing / validation | fast-changing shape             |
| reused in business logic  | third-party integration details |

**Simple rule:**  
If you keep using the same path in code, promote it to a field or accessor.  
For nested JSON, model stable subtrees as nested `JOJO` / `JAJO`.

### From Schema to Model

JSON Schema helps describe structure, but structure alone does not define a good Java model.

The real question is not:
- Should every schema member become a field?

The real question is:
- What should become part of the stable Java API?

[Generating Java from JSON Schema](https://sjf4j.org/generator) is easy now. **Designing boundaries is the hard part.**
