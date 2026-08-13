---
title: "Compile-Time Object Mapping in Java"
description: "Map between POJO, record, Map, List, JsonObject, JsonArray, JOJO, JAJO, and other SJF4J structures using @CompiledMapper."
---

# Mapping

SJF4J provides compile-time object mapping through `@CompiledMapper`.

Like MapStruct, it generates type-safe mapping code during compilation with no
reflection at runtime.  

Unlike MapStruct, it can also map directly across SJF4J's Object-Based Node Tree ([OBNT](/docs/modeling.md)) shapes:
- POJOs, records, `Map`, JOJO, and `JsonObject`
- `List`, `Set`, Java arrays, JAJO, and `JsonArray`
- scalar leaves such as `String`, `Number`, `Boolean`, enums, and `@NodeValue`
- limited type-level `@OneOf` dispatch


## Quick Start

Add `sjf4j-processor` (See [Choose Your Setup](./architecture#choose-your-setup) for Maven configuration).
```groovy
implementation("org.sjf4j:sjf4j:{version}")
annotationProcessor("org.sjf4j:sjf4j-processor:{version}")
```

Declare a mapper interface:

```java
@CompiledMapper
public interface UserMapper {
    UserDto toDto(User user);
}
```

Use the generated implementation:

```java
UserMapper mapper = CompiledNodes.instanceOf(UserMapper.class);

UserDto dto = mapper.toDto(user);
```

Same-name properties are mapped automatically:

```text
user.name  -> dto.name
user.age   -> dto.age
```

When names differ, describe only the difference:

```java
@Mapping(target = "displayName", source = "name")
UserDto toDto(User user);
```

## Mental Model

`@CompiledMapper` maps one declared source shape to one declared target shape.
Start with the properties that already match, then add explicit rules only where
the shapes differ.

```text
Source shape
(POJO / record / Map / JsonObject / JOJO / ...)
        |
        | 1. Declare a mapper method
        |    Source -> Target, or update(Target, Source)
        |
        | 2. Let same-name properties map automatically
        |    source.name -> target.name
        |
        | 3. Add rules for shape differences
        |    @Mapping.source / @Mapping.compute / target paths
        |
        | 4. Add converters when types differ
        |    using / local mapper methods / imported mappers
        |
        | 5. Choose update behavior when mutating
        |    nulls / arrays / objects
        v
Target shape
(POJO / record / Map / JsonObject / JOJO / ...)
```

Non-void abstract methods create a new target and return `null` when all source
arguments are `null`. Void methods update the first parameter in place from the
remaining source parameters.

## Auto Mapping

By default, writable target properties are mapped from readable source
properties with the same node-facing name.

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

- public no-args constructors
- record canonical constructors
- unique public constructors
- `@MappingCreator` rules

Auto mapping uses SJF4J node-facing property names. When present, names from
`@NodeProperty`, Jackson `@JsonProperty`, and fastjson2 `@JSONField` participate
in property matching.

Auto mapping is recursive when the processor can determine a compatible
structural mapping or converter.

## Explicit Property Mapping

Use `@Mapping` when the target shape differs from the source shape.

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
qualified. With multiple source parameters, unqualified source names are resolved
against the first source parameter.

## Computed Values

Use `compute` when a target value is derived from one or more source values.

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
Java code. It is not evaluated dynamically at runtime.

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

Nested mapping works through generated converters, local mapper methods, and
imported compiled mappers.

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

Imported mapper interfaces must themselves be `@CompiledMapper` interfaces.

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

You can also prefer an imported method explicitly:

```java
@CompiledMapper(importing = {OrderMapper.class})
interface UserMapper {
    @MapperOptions(using = {"OrderMapper::toDto"})
    UserDto toDto(User user);
}
```

`using` is a preference, not a forced conversion. If a value is already directly
assignable to the target type, direct assignment wins.

### Selection Model

For each target property or path, the processor first selects the value:

1. `ignore = true` skips the target.
2. `compute` supplies an explicit generated expression or helper call.
3. `source` reads a named source property or path.
4. Auto mapping reads a same-name source property.

Then, if the selected value is not directly assignable to the target type, the
processor looks for a compatible conversion. It considers preferred `using`
methods, limited `@OneOf` dispatch, local mapper methods, imported mapper
methods, strict scalar conversion, recursive container conversion, and generated
structural helpers. The exact choice depends on type compatibility and
ambiguity; add `using` or an explicit helper method when the intended conversion
is not obvious.

## Strict Scalar Conversion

Generated mappers use strict scalar conversion at mapper leaves. They do not try
to coerce every arbitrary value into every arbitrary target type.

Supported scalar conversion includes:

- numeric widening and narrowing through SJF4J number checks
- declared `Object` values to numeric, boolean, string, character, or enum
  targets through `Nodes.toXxx(...)` semantics
- `String`, `Character`, and enum conversion where SJF4J has explicit node rules
- `@NodeValue` codecs

Examples:

```text
Long -> int
Object -> Integer
Object -> Boolean
String -> MyEnum
Character -> String
Map -> Address
```

Lenient coercions such as arbitrary `String -> Number` or `Boolean -> String`
are intentionally not generated. If a conversion may lose meaning or needs
domain-specific parsing, define an explicit mapper method, helper method,
`compute` expression, or `@NodeValue` codec.

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
List<List<User>>               -> List<List<UserDto>>
Map<String, List<User>>        -> Map<String, List<UserDto>>
Map<String, Map<String, User>> -> Map<String, Map<String, UserDto>>
```

Supported array-like sources include declared `List`, declared `Set`, Java
arrays, `JsonArray`, JAJO, and raw source `List` / `Set` treated as
`List<Object>` / `Set<Object>`.

Typed Java array and typed collection root targets allocate fresh typed
containers and apply element conversion. Plain `JsonArray` and JAJO root targets
are different: they are shallow one-level copies, and elements are copied as-is.

Current container limits:

- raw or non-parameterized target collection/map shapes are rejected
- map key conversion is not generated; key types must already match
- root `Map` projection from POJO / `JsonObject` / JOJO requires a compatible
  key type, commonly `String`
- when a declared root source is `Object`, array-like projection accepts runtime
  `List` values, not runtime `Set` values
- other declared `Collection` source types are rejected unless declared as
  `List` or `Set`

## Structural Mapping with OBNT Types

SJF4J mapping is not limited to POJO-to-POJO conversion. It can also project
between Java objects and OBNT-facing structures.

### Object-like Sources to POJO or Record Targets

Object-like sources such as `Map`, `JsonObject`, and JOJO can bind to declared
POJO, record, or constructor targets:

```java
@CompiledMapper
interface Users {
    UserDto toDto(Map<String, Object> source);

    UserDto toDto(JsonObject source);
}
```

Nested object-like values can be converted recursively when the target type is
declared.

### POJO, Record, JsonObject, or JOJO to Map

Root `Map<String, V>` targets can be projected from POJO, record, `JsonObject`,
or JOJO sources. Values are converted according to the declared map value type.

```java
@CompiledMapper
interface Users {
    Map<String, Object> toMap(User user);
}
```

Map key conversion is not generated; root map projection expects compatible key
types.

### JsonObject Targets

Plain root `JsonObject` projection is shallow:

- first-level readable properties or entries are copied
- child object, array, or POJO values are shared as-is
- deep OBNT materialization is not performed by the generated mapper

Use a typed target when you need recursive conversion of child values.

### JOJO Targets

JOJO root create targets combine typed declared properties with shallow dynamic
extras:

- declared JOJO properties are mapped using normal typed target rules
- first-level dynamic entries that do not match declared JOJO properties are
  copied into the target as JSON-style extras

JOJO update targets are not generated.

### JsonArray and JAJO Targets

Plain `JsonArray` and JAJO root create targets are shallow one-level copies.
Elements are copied as-is, with no scalar conversion, preferred mapper use, or
deep materialization.

Typed Java array and typed collection targets allocate fresh typed containers and
apply element conversion.

## OneOf Dispatch

`@CompiledMapper` supports limited type-level `@OneOf` dispatch for create
mappings.

Two forms are supported:

- discriminator-key dispatch when the target `@OneOf` declares a `key`
- shape-based dispatch when the target `@OneOf` does not declare a `key`

Example:

```java
@OneOf(key = "type", value = {
        @OneOf.Mapping(value = Cat.class, when = "cat"),
        @OneOf.Mapping(value = Dog.class, when = "dog")
})
interface Animal {}

@CompiledMapper
interface Animals {
    Animal animal(Map<String, Object> source);
}
```

Current limits:

- root `@OneOf` update targets are unsupported
- field- or parameter-local `@OneOf` dispatch is outside compiled mapper scope
- discriminator paths and non-current scopes are not generated
- when no branch matches, behavior follows the target `@OneOf` no-match policy

## Target Path Writes

Target path writes are one of the main differences between `@CompiledMapper` and
ordinary JavaBean mappers.

### Strict Target Path Write with `@Mapping`

`@Mapping` can write to a JSONPath or JSON Pointer target path:

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
`@Mapping`. Use `@EnsureMapping` when parents should be created.

`@Mapping(ignore = true)` does not support target paths.

### Write Only If the Parent Exists

Use `@MappingIfParentPresent` when the final target parent is optional:

```java
@CompiledMapper
interface Users {
    @MappingIfParentPresent(target = "$.profile.name", source = "name")
    void update(UserView target, User user);
}
```

If the final parent object/container is missing, the write is skipped.

Rules:

- `target` must be JSONPath or JSON Pointer, not a plain property name
- the path must contain a non-root child
- path segments may be property names or array/list indexes
- `sources` may be used only with `compute`
- `nestedMapper` may name a local mapper method, but cannot be combined with
  `compute`

### Ensure Missing Parents

Use `@EnsureMapping` when missing intermediate parents should be created:

```java
@CompiledMapper
interface Users {
    @EnsureMapping(target = "$.profile.name", source = "name")
    void update(UserView target, User user);
}
```

This is useful when writing into map-like or JSON-like target structures.

Rules:

- `target` must be JSONPath or JSON Pointer, not a plain property name
- the path must contain a non-root child
- index-based target path segments are not supported by `@EnsureMapping`
- `nestedMapper` may name a local mapper method, but cannot be combined with
  `compute`

Target-path writes do not support non-default array or object update policies;
use normal property update policies for container properties.

## Target Creation

Targets are normally created using:

- public no-args constructors
- record canonical constructors
- unique public constructors

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

The implementation must be assignable to `targetType` and must itself satisfy
normal target construction rules.

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

`@MappingCreator` rules are selected by assignability. The most specific
matching `targetType` wins; equal or unrelated matches are rejected as ambiguous.
Creators declared on parent mapper interfaces are inherited.

Current creator method rules:

- `creator` supports the `this::method` form
- the method must be `default` or `static`
- the method must not declare parameters
- the return type must be assignable to `targetType`

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
- when all source parameters are `null`, the generated method returns without
  changing the target

### Null Value Policies

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
| `IGNORE` | Keep the existing target property or mutable create-target default when the source property is `null` |

Boundaries:

- default null policy is `SET_TO_NULL`
- `IGNORE` is supported for mutable no-args create targets and update targets
- constructor and record create targets cannot use `IGNORE`, because required
  constructor arguments must be supplied
- root container update methods return immediately when the source root is
  `null`, because the target parameter itself cannot be reassigned

### Array Policies

Array-like policies control how update methods handle existing list, set, or
other supported array-like container target properties.

| Policy | Behavior |
|--------|----------|
| `SET` | Replace the target property with a newly mapped container |
| `CLEAR_ADD` | Clear the existing target container, then add mapped source elements |
| `ADD` | Keep existing target elements and append mapped source elements |

Method-level default:

```java
@CompiledMapper
interface Users {
    @MapperOptions(arrays = ArrayPolicy.ADD)
    void update(UserDto target, User source);
}
```

Property-level override:

```java
@CompiledMapper
interface Users {
    @Mapping(target = "tags", array = ArrayPolicy.ADD)
    void update(UserDto target, User source);
}
```

Notes:

- default array-like update behavior is `CLEAR_ADD`
- `@Mapping.array` is supported only on `void` update mapper methods
- root collection update does not support `ArrayPolicy.SET`; use `CLEAR_ADD` or
  `ADD`
- null handling is applied before container update policy

### Object Policies

Object-like policies control how update methods handle existing map-like target
properties.

| Policy | Behavior |
|--------|----------|
| `PUT` | Put mapped source entries into the existing target map/object |
| `CLEAR_PUT` | Clear the existing target map/object, then put mapped source entries |
| `PUT_IF_ABSENT` | Put only when the key is missing or currently maps to `null` |

Method-level default:

```java
@CompiledMapper
interface Users {
    @MapperOptions(objects = ObjectPolicy.CLEAR_PUT)
    void update(UserDto target, User source);
}
```

Property-level override:

```java
@CompiledMapper
interface Users {
    @Mapping(target = "attributes", object = ObjectPolicy.PUT_IF_ABSENT)
    void update(UserDto target, User source);
}
```

Notes:

- default object-like update behavior is `PUT`
- there is no `ObjectPolicy.SET`
- `@Mapping.object` is supported only on `void` update mapper methods
- `PUT_IF_ABSENT` skips conversion for existing non-null target entries
- null handling is applied before container update policy

## Compared with MapStruct

Both frameworks provide:

- compile-time code generation
- mapper interfaces
- automatic property mapping
- explicit property mappings
- helper methods and converter methods

`@CompiledMapper` additionally supports SJF4J structural mapping features:

- Map / `JsonObject` / JOJO awareness
- `JsonArray`, JAJO, Java array, `List`, and `Set` container mapping
- JSONPath and JSON Pointer source reads
- JSONPath and JSON Pointer target writes
- strict SJF4J scalar conversion
- typed mapping between Java models and JSON-like structures
- `@EnsureMapping`
- `@MappingIfParentPresent`
- limited type-level `@OneOf` dispatch

Use MapStruct when your world is purely JavaBean-to-JavaBean and you prefer its
ecosystem. Use `@CompiledMapper` when the mapping crosses SJF4J structural
boundaries or needs SJF4J path and node semantics.

## Performance Notes

In SJF4J's JMH mapper benchmarks, `@CompiledMapper` performs at roughly the same level as MapStruct and hand-written
mapping. 
See [Benchmarks](/docs/benchmarks.md) for local benchmark results. 

SJF4J is also listed in the third-party [Java Object Mapper Benchmark](https://github.com/arey/java-object-mapper-benchmark).

## Current Notes and Limits

`@CompiledMapper` is focused on generated structural mapping code. Some behavior
belongs to SJF4J facade/binding APIs instead of mapper generation.

Current notes:

- mapper interfaces and mapper methods should not declare type parameters
- raw target collection and map types are rejected
- map key conversion is not generated
- arbitrary string-to-number or boolean-to-string coercion is not generated
- Java array and JAJO targets are create-oriented rather than general in-place
  update targets
- JOJO update targets are not generated
- plain root `JsonObject`, `JsonArray`, and JAJO projections are shallow
- full runtime facade context, runtime converters, private binding, and deep
  OBNT materialization remain part of node binding/facade APIs

## Best Practices

- Start with auto mapping, then declare only the differences.
- Use `@MapperOptions(using = {...})` to remove converter ambiguity.
- Keep `compute` expressions short; move complex logic to helper methods.
- Use path mapping at structural boundaries, not as a general business-rule DSL.
- Declare null and container policies explicitly on update methods.
- Use `@MappingCreator` for interface, abstract, or controlled-construction
  targets.
