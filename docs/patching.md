---
title: "Java JSON Patch, Merge Patch, and Partial Updates"
description: "Apply RFC 6902 JSON Patch and RFC 7386 JSON Merge Patch to existing Java object graphs, including JsonObject, JsonArray, Map, List, POJO, and JOJO nodes."
---

# Patching (JSON Patch)

SJF4J supports two standardized patch formats:
- [JSON Patch (RFC 6902)](https://datatracker.ietf.org/doc/html/rfc6902)
- [JSON Merge Patch (RFC 7386)](https://datatracker.ietf.org/doc/html/rfc7386)

## Patching with `JsonPatch`


`JsonPatch` is designed for **in-place partial updates** on existing structures.
Its operations and processing model follow RFC 6902 directly.
If you are familiar with JSON Patch, you can use `JsonPatch` with the same mental model.

### Applying a Patch

A `JsonPatch` is an ordered list of patch operations (`PatchOperation`),
applied sequentially to a target node.
```java
JsonObject node = JsonObject.fromJson("""
{
    "name": "Bob",
    "scores": [90, 95, 98],
    "active": true
}
""");

JsonPatch patch = JsonPatch.fromJson("""
[
    { "op": "add", "path": "/scores/-", "value": 100 },
    { "op": "replace", "path": "/name", "value": "Alice" },
    { "op": "remove", "path": "/active" }
]
""");

patch.apply(node);
```

Result:
```json
{
    "name": "Alice",
    "scores": [90, 95, 98, 100]
}
```

Patch operations:
- Are executed ***in order***
- Mutate the target object ***in place***
- Stop immediately if any operation fails

Patch execution is ***non-transactional***:
- Patch application is atomic per operation.
- If an operation fails:
  - The patch process stops
  - An exception is thrown
  - Previously applied operations remain applied


### Generating a Patch

Use `JsonPatch.diff()`:
```java
List<Integer> source = Arrays.asList(1, 2, 3);
List<Integer> target = Arrays.asList(1, 5, 3, 4);

JsonPatch patch = JsonPatch.diff(source, target);
```

This produces:
```json
[
    {"op":"replace", "path":"/1", "value":5, "from":null},
    {"op":"add", "path":"/-", "value":4, "from":null}
]
```

Apply it:
```java
List<Integer> another = Sjf4j.global().deepNode(source);
patch.apply(another);

assertEquals(target, another);
```

`diff()` computes a structural transformation that converts `source` into `target`.

### Operation Model

`PatchOperation` contains:
- `op` — operation name
- `path` — target location (JSON Pointer syntax)
- `value` — optional
- `from` — source location (for `move` and `copy`)

#### Standard Operations

Defined by RFC 6902:

| Operation | Description                                        | Example                                            |
|-----------|----------------------------------------------------|----------------------------------------------------|
| `add`     | Adds a value at the target path                    | `{"op": "add", "path": "/a/b/c", "value": "foo"}`  |
| `replace` | Replaces the value at the target path (must exist) | `{"op": "replace", "path": "/a/b/c", "value": 42}` |
| `remove`  | Removes the value at the target path (must exist)  | `{"op": "remove", "path": "/a/b/c"}`               |
| `move`    | Moves a value from one location to another         | `{"op": "move", "from": "/a/b", "path": "/a/j"}`   |
| `copy`    | Copies a value from one location to another        | `{"op": "copy", "from": "/a/b", "path": "/a/k"}`   |
| `test`    | Asserts that the value equals the expected value   | `{"op": "test", "path": "/a/b/c", "value": "foo"}` |


#### Extensions (by SJF4J)

| Operation   | Description                                                            | Example                                             |
|-------------|------------------------------------------------------------------------|-----------------------------------------------------|
| `exist`     | Asserts that the target path exists                                    | `{"op": "exist", "path": "/a/b/c"}`                 |
| `put`       | Similar to `add`, but replaces array elements instead of inserting.    | `{"op": "put", "path": "/e/2", "value": "z"}`       |
| `ensurePut` | Ensures the path exists and inserts value, creating intermediate nodes | `{"op": "ensurePut", "path": "/x/y", "value": "z"}` |


#### Defining custom operations

Custom operations can be registered via `OperationRegistry`.
```java
OperationRegistry.register("add", (target, op) -> {     // The Standard 'add' operation
    op.getPath().add(target, op.getValue());
});
```

## Merge Patch with `Patches`

SJF4J supports two merge-style patch APIs in addition to RFC 6902 `JsonPatch`:

- `Patches.mergePatch(target, patch)`
- `Patches.indexedMerge(target, patch, overwrite, deepCopy)`

They solve different problems.

### `mergePatch()`

Unlike JSON Patch (RFC 6902), [JSON Merge Patch (RFC 7386)](https://datatracker.ietf.org/doc/html/rfc7386):
- is object-based
- does not use paths
- is not operation-based

`mergePatch(...)` follows RFC 7386 semantics:
- If `patch` is not an object → it replaces the entire target root
- If a field exists in both target and patch → replaced or recursively merged
- If a field in patch is `null` → removed from the target object
- Nested objects → merged recursively
- Arrays → replaced as a whole

Example:

```java
JsonObject source = JsonObject.fromJson("""
{
    "name": "Bob",
    "profile": {"city": "Paris", "age": 18},
    "tags": ["a", "b"],
    "active": true
}
""");

// Continue with the returned root, because merge patch may replace
// the entire document instead of mutating the original root instance.
Object merged = Patches.mergePatch(source, JsonObject.fromJson("""
{
    "profile": {"age": 20},
    "tags": ["x"],
    "active": null
}
"""));
```

Result (`merged`):

```json
{
    "name": "Bob",
    "profile": {"city": "Paris", "age": 20},
    "tags": ["x"]
}
```

Notes:
- Capture the return value when the patch may replace the root
- On POJO targets, `null` means **remove**, not `set null`
- Structural POJO fields cannot be removed, so such patches fail with `JsonException`

### `indexedMerge()`

`indexedMerge(...)` is SJF4J's general-purpose in-place merge API.

It is **not** RFC 7386:
- Object members merge by key
- Arrays merge by index
- Recursion happens only when both sides have the same container shape
- `overwrite=true` replaces existing non-null values
- `overwrite=false` fills only missing or `null` target values
- `deepCopy=true` copies composite patch values before assignment

Null handling differs from `mergePatch(...)`:
- Object `null` is a normal assigned value
- In array-to-array merge:
  - non-final `null` = skip that index
  - final `null` = truncate to the preceding length

Examples:
- `[null, 2, 3]` → update indexes `1` and `2` only (skip `0`)
- `[1, 2, null]` → result becomes `[1, 2]`
- `[null]` → clear the array

If a trailing-`null` array patch is assigned into a non-array slot, SJF4J stores the same array after removing the trailing sentinel.

Example:

```java
JsonObject source = JsonObject.fromJson("""
{
    "items": [10, 20, 30, 40],
    "config": {"a": 1}
}
""");

source.indexedMerge(JsonObject.fromJson("""
{
    "items": [null, 25, null],
    "config": {"b": 2}
}
"""), true, false);
```

Result:

```json
{
    "items": [10, 25],
    "config": {"a": 1, "b": 2}
}
```

Notes:
- `indexedMerge(...)` always mutates the target in place
- It is usually the better choice for internal sparse partial updates
- Fixed-size Java arrays cannot be truncated; such merges fail with `JsonException`


## When to Use Patch

Use patching when you need **in-place partial updates** on existing structures.

Unlike [Mapping](mapping), patching changes the current object graph instead of producing a transformed target shape.

Typical use cases:
- Applying HTTP `PATCH` requests to partially update a resource
- Incrementally updating state without reconstructing the entire object
- Modifying deeply nested fields using precise path-based operations
- Synchronizing changes (e.g. event-driven or diff-based updates)  

