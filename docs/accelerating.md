---
title: "TODO Java JSON and Object Graph Processing"
description: "Performance-oriented guidance for TODO SJF4J workloads through reuse, model choice, reduced conversion, and workload-specific measurement."
---

# TODO

SJF4J is designed for low-overhead structural processing on OBNT.
This guide focuses on practical ways to reduce repeated work, avoid unnecessary conversion, and choose faster execution paths.

## Performance Model

SJF4J performance is shaped mainly by three factors:

- the underlying data model (`Map`/`List`, `JOJO`, `POJO`)
- whether compiled components are reused
- how much intermediate conversion happens in the workflow

In general, SJF4J performs best when it can stay close to the native object graph and avoid rebuilding structure between steps.

## Reuse Compiled Components

For hot paths, prefer creating reusable components once and applying them many times.

Typical candidates include:

- `JsonPath` / `JsonPointer`
- `NodeMapper`
- `SchemaValidator`
- reusable parsing or facade configuration via `Sjf4j.builder()`

```java
JsonPath scorePath = JsonPath.compile("$.scores[*]");

List<Integer> scores1 = scorePath.find(node1, Integer.class);
List<Integer> scores2 = scorePath.find(node2, Integer.class);
```

## Choose the Right Data Model

Different object models provide different performance trade-offs.

| Model | Typical Strength |
|---|---|
| `Map` / `List` | Fastest raw structural traversal |
| `JOJO` | Good balance between typed fields and JSON-native access |
| `POJO` | Strong domain modeling, usually slower than `JOJO` or `Map` / `List` |

If your workload is path-heavy, mutation-heavy, or highly dynamic, `JOJO` is often a strong default.

## Avoid Unnecessary Conversion

A common optimization is to parse or bind once, then keep processing on the same object graph.

Prefer this style:

- parse once
- navigate, patch, validate, and map on the same OBNT graph
- avoid converting back and forth between multiple tree models unless required by integration boundaries

## Optimize Navigation Workloads

For navigation-heavy workloads:

- reuse compiled paths
- prefer precise paths over broad recursive descent when possible
- use `NodeStream` when multi-stage selection and filtering are clearer than repeated manual loops

## Optimize Mapping and Validation Workloads

For repeated mapping or validation:

- reuse the same `NodeMapper` for the same source/target shape
- reuse validators for the same schema definitions
- keep custom compute logic small and predictable on hot paths

## Measure With Your Workload

Microbenchmarks are useful, but the final decision should come from your own workload:

- real payload sizes
- real object models
- real path complexity
- real read/write ratios

Use [Benchmarks](./benchmarks) as a baseline, then verify behavior in your own application profile.

## Related Guides

- [Modeling](./modeling)
- [Navigating](./navigating)
- [Mapping](./mapping)
- [Benchmarks](./benchmarks)
