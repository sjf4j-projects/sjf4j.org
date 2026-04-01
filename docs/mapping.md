---
title: ""
description: ""
---

# Mapping

SJF4J provides a structural mapping capability through `NodeMapper`,
enabling projection from one object graph to another.  
It operates directly on **OBNT (Object-Based Node Tree)**,
and works uniformly across Java objects and JSON-like structures.

## Usage 

NodeMapper supports both imperative and declarative mapping styles:

**Approach 1 — Direct Implementation**  
Use direct implementation when full control is required.
```java
public class StudentMapper implements NodeMapper<Student, StudentDto> { 
    @Override
    public StudentDto map(Student source) {
        ...
    }
}
```

**Approach 2 — Builder (Declarative Mapping)**  
Use builder when mapping is primarily structural.
```java
NodeMapper<Student, StudentDto> mapper = NodeMapper
    .builder(Student.class, StudentDto.class)
    .copy(...)
    .value(...)
    .build();
```

Then map it:
```java
StudentDto studentDto = mapper.map(student);
```

## Mapping vs Patching

Mapping (`NodeMapper`) and Patching (`JsonPatch`) solve different problems.

| Capability   | Description                             |
|--------------|-----------------------------------------|
| **Patching** | Modify an existing structure in place   |
| **Mapping**  | Construct a new structure from a source |


## Core Mapping Actions

Custom mapping is defined as an ordered set of actions.

### Auto Mapping

By default, `NodeMapper` performs implicit mapping:
- Same-name fields are copied automatically
- Nested objects are mapped recursively 
- Equivalent to `Sjf4j.fromNode(sourceNode, targetType)`

```java
NodeMapper<User, UserDto> mapper = NodeMapper
        .builder(User.class, UserDto.class)
        .build();
```

This means the builder only needs to declare the differences.

### Copy Mapping

Use `copy(targetPath, sourcePath)` to copy values.
```java
.copy("displayName", "name")
.copy("city", "/profile/city")
.copy("$.friends[*].school", "/school")
```

Path types:
- Field name: `name`
- JSON Path: `$.friends[*].school`
- JSON Pointer: `/profile/city`

**Rules:**
- `targetPath` may match multiple nodes
- `sourcePath` must resolve to a single value
- If multiple targets match, the same value is assigned to each

### Value Mapping

Use `value(targetPath, value)` to assign constants.
```java
.value("status", "ACTIVE")
.value("/meta/badboy", false)
.value("$.scores[*]", 60)
```

If multiple targets match, the same value is applied to all.

### Compute Mapping

Use `compute(...)` for dynamic values.
```java
.compute("level", root -> {
    String level = root.getStringByPath("$.profile.level");
    return "VIP".equals(level) ? "LEVEL-1" : "LEVEL-2";
})
```

With current context:
```java
.compute("$.friends[*].grade", (root, current) -> {
    Integer score = Nodes.toInt(Nodes.getInObject(current, "score"));
    return score != null && score >= 90 ? "A" : "B";
})
```

Parameters:
- `root` — source root
- `current` — source node matched by path

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

### Ordered Execution

Mapping follows this pipeline:
1. Create target
2. Apply auto mapping
3. Execute actions in declaration order
4. Return target

```java
NodeMapper<User, UserDto> mapper = NodeMapper
        .builder(User.class, UserDto.class)
        .copy("name", "id")
        .value("name", "A")
        .compute("name", root -> "B")
        .build();
```
Result:
```java
name = "B"
```
**Last write wins.**

### Nested Mapping

Use `with(...)` to register nested mappers.

NodeMapper<Order, OrderDto> orderMapper = ...;

NodeMapper<User, UserDto> userMapper = NodeMapper
.builder(User.class, UserDto.class)
.with(orderMapper)
.build();
Key Rule

Nested mappers are not independent actions.

They are used only when a mapped value needs nested type conversion.

Order -> OrderDto

They do not:

scan target fields on their own
write fields independently
override action order
Example: Nested Mapper Does Not Override Actions
NodeMapper<User, UserDto> mapper = NodeMapper
.builder(User.class, UserDto.class)
.value("$.orders[1].price", 30)
.with(orderMapper)
.build();

Result:

orders[1].price = 30

with(orderMapper) only helps when an Order needs to be mapped into an OrderDto.
It does not override explicit actions like value(...).

Supported Structures

NodeMapper works with:

POJO
JOJO (JsonObject)
Map<String, Object>
List
arrays
Typical Use Cases
DTO Projection
.copy("username", "name")
.value("source", "api")
Flatten Structure
.copy("city", "profile.address.city")
Aggregation
.compute("avgScore", root -> ...)
Nested Mapping
.with(orderMapper)
Summary

NodeMapper provides a declarative structural mapping model on top of OBNT.

It supports:

direct Java implementation for simple mappers
builder-based declarative mapping for structural cases
default mapping with ordered overrides
path-based extraction
computed fields
nested object graph mapping

It complements JSON Patch:

Patch   -> modify existing data
Mapper  -> construct new data

Together, they form a complete structural processing model in SJF4J.











