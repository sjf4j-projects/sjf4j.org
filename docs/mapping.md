---
title: "Compile-Time Object Mapping in Java"
description: "Map between POJO, record, Map, List, JsonObject, JsonArray, JOJO, JAJO, and other SJF4J structures using @CompiledMapper."
---

# Mapping

SJF4J provides compile-time structural mapping through `@CompiledMapper`.

`NodeMapper` is deprecated. New mapping code should use `@CompiledMapper`,
which generates direct Java mapper implementations during annotation processing.

`@CompiledMapper` is similar in spirit to object-to-object mapping frameworks
such as MapStruct, but it is aware of SJF4J's structural model:

- POJO and record
- `Map`
- `List`, `Set`, and Java arrays
- `JsonObject` and `JsonArray`
- JOJO and JAJO

In short:

> `@CompiledMapper` is an object-to-object mapper with SJF4J structural awareness.

## Quick Start

Add `sjf4j-processor` as an annotation processor, then declare a mapper
interface:

```java
@CompiledMapper
public interface UserMapper {
    UserDto toDto(User user);
}
```

Get the generated mapper and use it like a normal Java object:

```java
UserMapper mapper = CompiledNodes.of(UserMapper.class);

User user = new User("Ada", 36);
UserDto dto = mapper.toDto(user);
```

The generated implementation maps same-name properties automatically:

```text
user.name  -> dto.name
user.age   -> dto.age
```

No reflection or runtime mapper lookup is needed for the generated mapping code.

When the source and target shapes differ, declare only the differences:

```java
@CompiledMapper
public interface UserMapper {
    @Mapping(target = "displayName", source = "name")
    UserDto toDto(User user);
}
```

## Mental Model

When using `@CompiledMapper`, think in terms of moving data from one shape to
another. Start with what already matches, then describe only the differences.

```text
Source shape
(User / Map / JsonObject / JOJO / ...)
        |
        | 1. Auto-map same-name properties
        |
        | 2. Declare shape differences
        |    @Mapping / compute / target paths
        |
        | 3. Reuse conversions when types differ
        |    local methods / importing / using
        |
        | 4. Choose update behavior when mutating
        |    nulls / arrays / objects
        v
Target shape
(UserDto / Map / JsonObject / JOJO / ...)
```

This gives a practical order for designing a mapper method:

1. **Let auto mapping do the obvious work**  
   Same-name properties should usually need no annotation.

2. **Add mappings only for shape differences**  
   Rename fields, read from paths, combine multiple source values, or compute
   derived values.

3. **Make conversions explicit when needed**  
   Use local mapper methods, `importing`, or `@MapperOptions(using = {...})`
   when a nested type or container element needs a specific conversion.

4. **Choose policies only for update methods**  
   Null handling and container update policies matter when an existing target is
   being mutated.

The details of auto mapping, `@Mapping`, `compute`, `using`, `importing`, path
writes, and update policies are introduced separately below.

## Auto Mapping

By default, writable target properties are mapped from readable source
properties with the same name.

```java
@CompiledMapper
interface Users {
    UserDto toDto(User user);
}
```

Supported source reads include:

- public fields
- JavaBean getters
- boolean `isXxx` getters
- record accessors

Supported target writes include:

- public setters
- writable public fields

Targets may be created from:

- a public no-args constructor
- a record canonical constructor
- a unique public constructor
- a `@MappingCreator` rule

Auto mapping is recursive where the processor can determine a compatible
structural mapping or converter.

## Explicit Property Mapping

Use `@Mapping` when the target shape is not exactly the same as the source
shape.

### Rename a Property

```java
@CompiledMapper
interface Users {
    @Mapping(target = "displayName", source = "name")
    UserDto toDto(User user);
}
```

### Ignore a Property

```java
@CompiledMapper
interface Users {
    @Mapping(target = "password", ignore = true)
    UserDto toDto(User user);
}
```

Constructor and record targets cannot ignore required constructor arguments,
because those arguments must still be supplied.

### Read from a Source Path

The `source` value may be a plain property name, JSONPath, or JSON Pointer:

```java
@CompiledMapper
interface Users {
    @Mapping(target = "city", source = "$.profile.city")
    @Mapping(target = "country", source = "/profile/country")
    UserDto toDto(User user);
}
```

### Map from Multiple Source Parameters

Mapper methods may have more than one source parameter:

```java
@CompiledMapper
interface Views {
    @Mapping(target = "userName", source = "user:name")
    @Mapping(target = "accountId", source = "account:id")
    UserView view(User user, Account account);
}
```

Use the `parameterName:propertyOrPath` form when a source property needs to be
qualified.

## Computed Values

`compute` is useful when a target value is derived from one or more source
values.

### Inline Compute

```java
@CompiledMapper
interface Users {
    @Mapping(
            target = "fullName",
            sources = {"firstName", "lastName"},
            compute = "(first, last) -> first + \" \" + last")
    UserDto toDto(User user);
}
```

The expression is consumed by the annotation processor and emitted as generated
Java code. It is not a runtime lambda registry.

### Helper Method

For anything more than a small expression, prefer a helper method:

```java
@CompiledMapper
interface Users {
    @Mapping(
            target = "fullName",
            sources = {"firstName", "lastName"},
            compute = "this::join")
    UserDto toDto(User user);

    default String join(String first, String last) {
        return first + " " + last;
    }
}
```

Keep computed mappings focused on shape conversion. If the logic starts to look
like business workflow, move that logic outside the mapper.

## Nested Mapping and Converter Selection

Nested mapping works through mapper methods and converter selection.

### Local Mapper Methods

Methods declared on the same mapper may be used as converters:

```java
@CompiledMapper
interface Users {
    UserDto toDto(User user);

    OrderDto toDto(Order order);
}
```

If `UserDto` contains an `OrderDto` property and `User` contains an `Order`, the
processor may use the local `Order -> OrderDto` method for that property.

### Preferred Converters with `using`

Use `@MapperOptions(using = {...})` to express converter preferences for one
mapper method:

```java
@CompiledMapper
interface Users {
    UserDto toDto(User user);

    @MapperOptions(using = {"toDto"})
    List<UserDto> toDtos(List<User> users);
}
```

`using` is a preference, not a forced conversion. If a value is already directly
assignable, direct assignment wins.

### Imported Mappers

Use `importing` when one compiled mapper should reuse another compiled mapper:

```java
@CompiledMapper
interface OrderMapper {
    OrderDto toDto(Order order);
}

@CompiledMapper(importing = {OrderMapper.class})
interface UserMapper {
    UserDto toDto(User user);
}
```

You can also prefer an imported method explicitly:

```java
@CompiledMapper(importing = {OrderMapper.class})
interface UserMapper {
    @MapperOptions(using = {"OrderMapper::toDto"})
    UserDto toDto(User user);
}
```

Converter selection follows this general order:

1. Direct assignment when the source value is assignable to the target type
2. Preferred methods from `@MapperOptions(using = {...})`
3. Local mapper methods
4. Imported `@CompiledMapper` methods
5. Generated structural helpers
6. Built-in strict SJF4J value conversion

## Strict Value Conversion

Generated mappers use SJF4J-style strict value conversion at mapper leaves.

Examples include:

- numeric widening and narrowing through SJF4J number checks
- string, character, enum, and boolean conversion with explicit rules
- `@NodeValue` codecs
- dynamic `Object` leaf conversion from maps, `JsonObject`, or paths through
  `Nodes.toXxx(...)`-style checks

SJF4J does not try to make every arbitrary value fit every arbitrary target
type. If conversion may lose meaning, make it explicit with a mapper method or a
computed mapping.

## Path-based Target Mapping

Path-based target writes are one of the main differences between
`@CompiledMapper` and ordinary JavaBean mappers.

### Strict Path Write

`@Mapping` can write to a target path:

```java
@CompiledMapper
interface Users {
    @Mapping(target = "$.profile.displayName", source = "name")
    UserView toView(User user);
}
```

Target values support three forms:

- plain property or key name
- JSONPath beginning with `$`
- JSON Pointer beginning with `/`

Plain dotted names are literal property/key names, not nested target paths.

Strict target-path writes require intermediate parents to already exist. The
root target exists, but missing nested parents are not created by plain
`@Mapping`.

### Write Only If the Parent Exists

Use `@MappingIfParentPresent` when the final target parent is optional:

```java
@CompiledMapper
interface Users {
    @MappingIfParentPresent(target = "$.profile.name", source = "name")
    UserView toView(User user);
}
```

If the final parent object/container is missing, the write is skipped.

### Ensure the Parent Path

Use `@EnsureMapping` when missing intermediate parents should be created:

```java
@CompiledMapper
interface Users {
    @EnsureMapping(target = "$.profile.name", source = "name")
    UserView toView(User user);
}
```

This is useful when writing into map-like or JSON-like target structures.
Index-based ensure paths are not supported by this ensure form.

## Collections, Maps, and Arrays

`@CompiledMapper` supports recursive element and value conversion through common
container shapes.

```java
@CompiledMapper
interface Users {
    UserDto toDto(User user);

    @MapperOptions(using = {"toDto"})
    List<UserDto> toDtos(List<User> users);

    @MapperOptions(using = {"toDto"})
    Map<String, UserDto> toDtoMap(Map<String, User> users);
}
```

Nested containers are handled recursively when element and value types are
declared:

```text
List<List<User>>              -> List<List<UserDto>>
Map<String, List<User>>       -> Map<String, List<UserDto>>
Map<String, Map<String, User>> -> Map<String, Map<String, UserDto>>
```

Supported array-like sources include declared `List`, declared `Set`, Java
arrays, `JsonArray`, JAJO, and raw source `List` / `Set` treated as
`List<Object>` / `Set<Object>`.

Raw target collection and map shapes are rejected because no element or value
type is available for generated conversion.

## Structural Mapping with OBNT Types

SJF4J mapping is not limited to POJO-to-POJO conversion. It can also project
between Java objects and OBNT-facing structures.

### Object-like Sources to POJO or Record Targets

Object-like sources such as `Map` and `JsonObject` can bind to declared POJO,
record, or constructor targets:

```java
@CompiledMapper
interface Users {
    UserDto toDto(Map<String, Object> source);
}
```

### POJO, JsonObject, or JOJO to Map

Root `Map<String, V>` targets can be projected from POJO, record, `JsonObject`,
or JOJO sources:

```java
@CompiledMapper
interface Users {
    Map<String, Object> toMap(User user);
}
```

Map key conversion is not generated; root map projection expects compatible key
types, commonly `String`.

### JsonObject Targets

Plain root `JsonObject` projection is shallow:

- first-level readable properties or entries are copied
- child object, array, or POJO values are shared as-is
- deep materialization is not performed by the generated mapper

### JOJO Targets

JOJO root create targets combine typed declared properties with shallow dynamic
extras:

- declared JOJO properties are mapped using normal typed target rules
- first-level dynamic entries are copied into the target as JSON-style extras

### JsonArray and JAJO Targets

Plain `JsonArray` and JAJO root create targets are shallow one-level copies.
Elements are copied as-is.

Typed Java array and typed collection targets are different: they allocate fresh
typed containers and apply element conversion.

## Target Creation

By default, generated mappers create targets through one of the normal target
construction rules:

- public no-args constructor
- record canonical constructor
- unique public constructor

Use `@MappingCreator` when the declared target type cannot or should not be
created directly.

### Implementation Type

```java
@CompiledMapper
@MappingCreator(
        targetType = UserView.class,
        implementation = UserViewImpl.class)
interface Users {
    UserView toView(User user);
}
```

The implementation must be assignable to the declared target type and must
itself satisfy normal target construction rules.

### Factory Method

```java
@CompiledMapper
@MappingCreator(
        targetType = UserView.class,
        creator = "this::newView")
interface Users {
    UserView toView(User user);

    default UserViewImpl newView() {
        return new UserViewImpl();
    }
}
```

Factory methods are useful when construction needs to go through a controlled
factory while mapping still writes normal mutable target properties.

## Update Mapping

Create methods return a new target object:

```java
UserDto toDto(User user);
```

Update methods mutate an existing target:

```java
void update(UserDto target, User source);
```

For update methods:

- the first parameter is the target
- remaining parameters are sources
- the target parameter itself is not replaced
- mapped properties and containers are updated according to null and container
  policies

## Null Handling

Use `NullValuePolicy` to control how null source values affect mutable target
properties.

```java
@CompiledMapper
interface Users {
    @MapperOptions(nulls = NullValuePolicy.IGNORE)
    void update(UserDto target, User source);
}
```

| Policy | Behavior |
|--------|----------|
| `SET_TO_NULL` | Write `null` to the target property when the source property is `null` |
| `IGNORE` | Keep the existing target property when the source property is `null` |

`IGNORE` is most useful for partial update methods. Constructor and record
create targets cannot generally use `IGNORE` for required constructor arguments,
because those arguments must be supplied.

## Container Update Policies

Update methods can also control how existing array-like and object-like
containers are updated.

### Array-like Policy

| Policy | Behavior |
|--------|----------|
| `CLEAR_ADD` | Clear the target container, then add source elements |
| `ADD` | Keep existing target elements and append source elements |
| `SET` | Replace the target property |

### Object-like Policy

| Policy | Behavior |
|--------|----------|
| `PUT` | Put source entries into the target object/map |
| `CLEAR_PUT` | Clear the target object/map, then put source entries |
| `PUT_IF_ABSENT` | Put only entries whose keys are absent from the target |
| `SET` | Replace the target property |

Method-level defaults:

```java
@CompiledMapper
interface Users {
    @MapperOptions(
            arrays = ArrayPolicy.ADD,
            objects = ObjectPolicy.PUT)
    void update(UserDto target, User source);
}
```

Property-level overrides:

```java
@CompiledMapper
interface Users {
    @Mapping(target = "tags", array = ArrayPolicy.ADD)
    @Mapping(target = "attributes", object = ObjectPolicy.PUT_IF_ABSENT)
    void update(UserDto target, User source);
}
```

Null handling is applied before container update policy. For example, with
`NullValuePolicy.IGNORE`, a null source container keeps the existing target
container unchanged.

## Migration from `NodeMapper`

`NodeMapper` used a runtime builder and an ordered action pipeline.
`@CompiledMapper` uses an annotation-processed static mapping model.

| `NodeMapper` | `@CompiledMapper` |
|--------------|-------------------|
| `NodeMapper.builder(S.class, T.class)` | `@CompiledMapper interface` |
| `.copy(target, source)` | `@Mapping(target = ..., source = ...)` |
| `.ensureCopy(target, source)` | `@EnsureMapping(target = ..., source = ...)` |
| `.compute(target, fn)` | `@Mapping(target = ..., sources = ..., compute = ...)` |
| `.value(target, value)` | `compute`, helper method, or default value logic |
| `.with(nestedMapper)` | local mapper method, `importing`, or `using` |
| runtime action list | compile-time generated implementation |
| declaration order controls final writes | processor builds a static target mapping model |

A practical migration path:

1. Create a `@CompiledMapper` interface for the source and target types.
2. Remove mappings that only copied same-name properties; let auto mapping do
   that work.
3. Convert `.copy(...)` rules to `@Mapping`.
4. Convert `.ensureCopy(...)` rules to `@EnsureMapping`.
5. Convert `.compute(...)` rules to `compute` expressions or helper methods.
6. Convert `.with(...)` nested mappers to local mapper methods, imported
   compiled mappers, or `@MapperOptions(using = {...})`.
7. Add explicit null and container update policies for update-style mappings.

The biggest conceptual change is that mapping is no longer an ordered list of
runtime actions. Prefer a stable target mapping model with explicit source,
conversion, and write rules.

## Compared with MapStruct

`@CompiledMapper` has a familiar shape if you already use MapStruct:

- mapper interfaces
- annotation processing
- generated implementations
- same-name property auto mapping
- explicit property mappings
- helper methods and converters

SJF4J adds structural mapping features that are natural for OBNT:

- `JsonObject`, `JsonArray`, JOJO, and JAJO awareness
- JSONPath and JSON Pointer target writes
- Map/List/object structural projection
- strict SJF4J value conversion
- mapping between typed Java models and JSON-like structures

Use MapStruct when your world is purely JavaBean-to-JavaBean and you prefer its
ecosystem. Use `@CompiledMapper` when the mapping crosses SJF4J structural
boundaries or needs SJF4J path and node semantics.

## Current Notes and Limits

`@CompiledMapper` is focused on generated structural mapping code. Some behavior
belongs to SJF4J facade/binding APIs instead of mapper generation.

Current notes:

- mapper interfaces and mapper methods should not declare type parameters
- map key conversion is not generated
- raw target collection and map types are rejected
- Java array and JAJO targets are create-oriented rather than general in-place
  update targets
- JOJO update targets are not generated
- full runtime facade context and private binding remain part of node
  binding/facade APIs

## Best Practices

- Start with auto mapping, then declare only the differences.
- Use `@MapperOptions(using = {...})` to remove converter ambiguity.
- Keep `compute` expressions short; move complex logic to helper methods.
- Use path mapping at structural boundaries, not as a general business-rule DSL.
- Declare null and container policies explicitly on update methods.
- Use `@MappingCreator` for interface, abstract, or controlled-construction
  targets.
