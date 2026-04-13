---
title: "Java Object Mapping and Structural Projection"
description: "Map between POJO, JOJO, Map, List, and other OBNT structures in Java using SJF4J's NodeMapper and annotation-based mapping rules."
---

# Mapping

SJF4J provides structural mapping through `NodeMapper`,
allowing one object graph to be projected into another.

It operates directly on OBNT and works across Java objects and JSON-like structures.

## Mapping Model

Mapping (`NodeMapper`) and [Patching](patching) (`JsonPatch`) solve different problems.

| Capability   | Description                             |
|--------------|-----------------------------------------|
| **Patching** | Modify an existing structure in place   |
| **Mapping**  | Construct a new structure from a source |


`NodeMapper` follows a simple projection pipeline:
```mermaid
flowchart LR
    A["Source (JOJO/POJO)"] --> B["Auto Mapping (with nested)"]
    B --> C[Apply mapping actions: copy / value / compute ...]
    C --> D["Target (JOJO/POJO)"]
```


## Ways to Use 

`NodeMapper` supports both imperative and declarative mapping styles:

**Way 1 — Direct Implementation**  
Use direct implementation when full control is needed.
```java
public class StudentMapper implements NodeMapper<Student, StudentDto> { 
    @Override
    public StudentDto map(Student source) {
        ...
    }
}
```

**Way 2 — Builder (Declarative Mapping)**  
Use the builder when mapping is mostly structural.
```java
NodeMapper<Student, StudentDto> mapper = NodeMapper
        .builder(Student.class, StudentDto.class)
        .copy(...)
        .value(...)
        .build();

StudentDto studentDto = mapper.map(student);
```

## Core Mapping Actions

Custom mapping is defined as an ordered set of actions.

### Auto Mapping

By default, `NodeMapper` performs implicit mapping:
- Same-name fields are copied automatically
- Nested objects are mapped recursively 
- Equivalent to `Sjf4j.global().fromNode(..)`

```java
NodeMapper<User, UserDto> mapper = NodeMapper
        .builder(User.class, UserDto.class)
        .build();
```

This means the builder only needs to declare the differences.

### Copy Mapping

Use `copy(targetPath, sourcePath)` and `ensureCopy()` to copy values.
```java
.copy("displayName", "name")
.copy("city", "/profile/city")
.ensureCopy("$.friends[0].school", "/school")
```

Both `targetPath` and `sourcePath`: 
- may be a field name, JSON Path, or JSON Pointer
- must resolve to a single value

### Value Mapping

Use `value(targetPath, value)` and `ensureValue()` to assign a constant value to one single target location.
```java
.value("status", "ACTIVE")
.value("/meta/badboy", false)
.ensureValue("$.scores[0]", 60)
```

### Compute Mapping

Use `compute(multiPath, ...)` and `ensureCompute(targetPath, ...)` to compute target values dynamically.
```java
.compute("level", root -> {
    String level = root.getStringByPath("$.profile.level");
    return "VIP".equals(level) ? "LEVEL-1" : "LEVEL-2";
})
```

`compute` supports multiple matches — the function will be invoked once for each matched target location.  
Example with matched target context:
```java
.compute("$.friends[*].grade", (root, parent, current) -> {
    Integer score = Nodes.toInt(Nodes.getInObject(parent, "score"));
    return score != null && score >= 90 ? "A" : "B";
})
```

Parameters:
- `multiPath` — may resolve to multiple values
- `root` — source root
- `parent` — the parent container of the matched target location
- `current` — the matched target value

The function is evaluated once per matched target location.

### Remove

Use `remove(targetPath)` to remove fields.
```java
.remove("password")
.remove("$.internal.*")
```

Behavior:
- not exist → ignored
- removable (`Map`, `JsonObject`) → removed
- otherwise → set to `null`
  - For non-removable targets, removal degrades to null assignment.

### Ordered Execution

Mapping follows this pipeline:
1. Create target
2. Apply auto mapping
3. Execute actions in declaration order
4. Return target

```java
NodeMapper<User, UserDto> mapper = NodeMapper
        .builder(User.class, UserDto.class)
        .copy("name", "name")
        .value("name", "A")
        .compute("name", root -> "B")
        .build();
```
Result:
```java
name = "B"
```

Actions are applied in declaration order. 
If multiple actions write the same location, the last write wins.

## Nested Mapping

Use `with(...)` to make nested mappers available during conversion.
```java
NodeMapper<Order, OrderDto> orderMapper = ...;

NodeMapper<User, UserDto> userMapper = NodeMapper
        .builder(User.class, UserDto.class)
        .with(orderMapper)
        .build();
```

**Rules**:
- Nested mappers are not independent actions.
- They are used only when a mapped value needs nested type conversion.
- They do not:
  - scan target fields on their own
  - write fields independently
  - override action order

Example: Nested Mappers Do Not Override Explicit Actions
```java
NodeMapper<User, UserDto> mapper = NodeMapper
        .builder(User.class, UserDto.class)
        .value("$.orders[1].price", 30)
        .with(orderMapper)
        .build();
```

Result:
```java
orders[1].price = 30
```


## Why Mapping in OBNT
In the POJO world, tools like `MapStruct` and `Spring Converter` provide mapping capabilities.  
Mapping in SJF4J fills the same gap for OBNT, useful for:
- DTO projection
- API shape conversion
- Structural normalization between different object models
