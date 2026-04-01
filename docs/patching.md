---
title: "Java JSON Patch and Merge Patch"
description: "Apply RFC 6902 JSON Patch and RFC 7386 Merge Patch to Java JSON objects, arrays, and POJO or JOJO nodes."
---

# Patching (JSON Patch)

SJF4J supports two standardized patch formats:
- [JSON Patch (RFC 6902)](https://datatracker.ietf.org/doc/html/rfc6902)
- [JSON Merge Patch (RFC 7386)](https://datatracker.ietf.org/doc/html/rfc7386)

## Patching with `JsonPatch`

`JsonPatch` enables declarative, path-based transformations on OBNT.

A `JsonPatch` is an ordered list of patch operations (`PatchOp`),
applied sequentially to a target node.

### Applying a Patch 

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

After applying:
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
operations applied before a failure are not rolled back.

### Generating a Patch with `JsonPatch.diff()`

```java
List<Integer> source = Arrays.asList(1, 2, 3);
List<Integer> target = Arrays.asList(1, 5, 3, 4);

JsonPatch patch = JsonPatch.diff(source, target);
```

Output a patch:
```json
[
    {"op":"replace", "path":"/1", "value":5, "from":null},
    {"op":"add", "path":"/-", "value":4, "from":null}
]
```

Apply it:
```java
List<Integer> another = Sjf4j.deepNode(source);
patch.apply(another);

assertEquals(target, another);
```

`diff()` computes a structural transformation that converts `source` into `target`.

## Patch Operation Model

Each `PatchOp` contains:
- `op` — operation name
- `path` — target location (JSON Pointer syntax)
- `value` — optional
- `from` — source location (for `move` and `copy`)

All paths use **JSON Pointer (RFC 6901)** syntax.

### Standard Operations (RFC 6902)

| Operation | Description                                        | Example                                            |
|-----------|----------------------------------------------------|----------------------------------------------------|
| `add`     | Adds a value at the target path                    | `{"op": "add", "path": "/a/b/c", "value": "foo"}`  |
| `remove`  | Removes the value at the target path (must exist)  | `{"op": "remove", "path": "/a/b/c"}`               |
| `replace` | Replaces the value at the target path (must exist) | `{"op": "replace", "path": "/a/b/c", "value": 42}` |
| `move`    | Moves a value from one location to another         | `{"op": "move", "from": "/a/b", "path": "/a/j"}`   |
| `copy`    | Copies a value from one location to another        | `{"op": "copy", "from": "/a/b", "path": "/a/k"}`   |
| `test`    | Asserts that the value equals the expected value   | `{"op": "test", "path": "/a/b/c", "value": "foo"}` |


### SJF4J Extensions

| Operation   | Description                                                            | Example                                             |
|-------------|------------------------------------------------------------------------|-----------------------------------------------------|
| `exist`     | Asserts that the target path exists                                    | `{"op": "exist", "path": "/a/b/c"}`                 |
| `ensurePut` | Ensures the path exists and inserts value, creating intermediate nodes | `{"op": "ensurePut", "path": "/x/y", "value": "z"}` |

**Error Handling**

- Patch application is atomic per operation.
- If an operation fails:
  - The patch process stops
  - An exception is thrown
  - Previously applied operations remain applied (non-transactional)

### Defining custom `PatchOp`

Custom operations can be registered via `PatchOpRegistry`.
```java
PatchOpRegistry.register("add", (target, op) -> {           // The Standard 'add' operation
    op.getPath().add(target, op.getValue());
});
```

## Merging under JSON Merge Patch (RFC 7386)

Unlike JSON Patch (RFC 6902), [JSON Merge Patch (RFC 7386)](https://datatracker.ietf.org/doc/html/rfc7386):
- Is object-based
- Does not use paths
- Is not operation-based

### `Patches.mergeRfc7386(source, patch)`

Follows RFC 7386 semantics:
- If a field exists in both target and patch → replaced
- If a field in patch is `null` → removed from target
- Nested objects → merged recursively
- Arrays → replaced as a whole


### `Patches.merge(source, patch, overwrite, deepCopy)`

Compared to `mergeRfc7386()`, `merge()` provides more flexible and customizable merging semantics.

Additional behaviors:
- `overwrite`
  - `true` → replace existing values
  - `false` → only insert missing keys
- `deepCopy`
  - `true` → deep clone values
  - `false` → reference copy
- `null` in patch → no-op
- Arrays → merged recursively (not replaced)


## Why Patch in OBNT
Because OBNT operates on plain Java objects:

- Patch applies directly to real object graphs
- No AST conversion layer is introduced
- Works uniformly across `Map`, `List`, `POJO`, `JOJO`
- Structural equality aligns with patch `test` semantics

`JsonPatch` in SJF4J is not a wrapper around JSON text —
it is a structural transformation mechanism for OBNT.














