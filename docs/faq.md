---
title: "SJF4J FAQ"
description: "Find answers about SJF4J architecture, OBNT, JOJO, backend libraries, YAML support, performance, JsonPath, JsonPatch, and JsonSchema usage in Java."
---

# FAQ

## What is SJF4J?

**SJF4J (Simple JSON Facade for Java)** is a Java JSON facade that unifies parsing, modeling, querying, transformation, and validation behind one JSON-semantic API. It does not try to replace every JSON library. Instead, it sits on top of existing backends and gives you one structural model for working with structured data.

If you are evaluating Java JSON libraries, the easiest mental model is this:

- **Jackson / Gson / Fastjson2** give you backend-specific APIs
- **SJF4J** gives you one semantic layer across those backends and across different node styles such as `Map`, `List`, `POJO`, `JOJO`, and `JsonObject`

## How is SJF4J different from Jackson or Gson?

Jackson and Gson are primarily JSON libraries with their own parsing, binding, and tree APIs. SJF4J is a **facade and structural processing layer** that can sit on top of those libraries.

The practical difference is not just syntax. SJF4J tries to keep the same concepts available across the whole lifecycle:

- parse JSON or YAML
- bind into typed Java objects
- preserve dynamic JSON fields when needed
- query with JSON Path or JSON Pointer
- transform with JSON Patch or Merge Patch
- validate with JSON Schema

That unified flow is the main reason to choose it.

## Is SJF4J a parser, an object mapper, or a full JSON processing framework?

It is a bit of all three, but its real identity is a **unified JSON-semantic processing layer**.

- As a **parser/codec**, it can read and write JSON, YAML, and Java Properties.
- As a **binding layer**, it can work with `POJO`, `JOJO`, `JAJO`, `Map`, `List`, and raw values.
- As a **processing framework**, it adds JSON Path, JSON Patch, Merge Patch, and JSON Schema on top of the same node model.

So if you only need `fromJson()` and `toJson()`, a native backend may already be enough. If you want one model that also supports path, patch, and schema, SJF4J becomes much more interesting.

## Which JSON parsers and data formats does SJF4J support?

SJF4J supports multiple JSON backends and multiple structured data formats.

**JSON backends**

- Jackson
- Gson
- Fastjson2
- JSON-P
- built-in minimal fallback parser when no external backend is present

**Formats**

- JSON
- YAML
- Java Properties
- direct in-memory Java object graphs

Two caveats matter:

- YAML support requires `SnakeYAML` on the classpath.
- The built-in JSON parser is functional but slower than dedicated backends.

## What is OBNT, and why does it matter?

**OBNT** means **Object Based Node Tree**. It is the core idea behind SJF4J.

Instead of forcing all structured data into a separate AST like `JsonNode` or `JsonElement`, SJF4J treats ordinary Java objects as nodes in a unified tree. That means a node can be:

- a `Map`
- a `List`
- a `JsonObject` or `JsonArray`
- a typed `POJO`
- a hybrid `JOJO` or `JAJO`
- a primitive-like value such as `String`, `Number`, `Boolean`, `null`, or `NodeValue`

Why this matters: once everything participates in the same semantic model, path, patch, traversal, inspection, and validation no longer need separate representations for separate use cases.

## What is JOJO, and when should I use it instead of a POJO?

**JOJO** means **JSON Object Java Object**. It is one of SJF4J's most distinctive ideas.

A JOJO is a typed Java object that also behaves like a JSON object. In practice, that means:

- you keep normal Java fields and methods
- you can still preserve and access undeclared JSON properties
- the same object remains compatible with SJF4J's JSON-semantic APIs

Use **POJO** when your schema is stable and you want a conventional Java model.

Use **JOJO** when your payload is mostly typed but may still contain dynamic or unknown JSON fields that you do not want to lose.

## How does SJF4J handle unknown or extra JSON fields?

This is exactly where SJF4J becomes more helpful than plain object binding.

With raw nodes such as `Map` and `JsonObject`, extra fields are naturally preserved. With `JOJO`, you can keep typed Java fields **and** still retain additional JSON properties. That makes SJF4J a strong fit for:

- evolving APIs
- integration payloads you do not fully control
- configuration documents with extension fields
- cases where strict typing and JSON flexibility must coexist

If you want to avoid the classic tradeoff between "typed model" and "unknown field preservation," JOJO is usually the feature to look at first.

## Can SJF4J work directly on existing Java object graphs without serializing to JSON first?

Yes. This is one of its most useful design choices.

SJF4J can operate directly on in-memory Java object graphs through OBNT. In other words, the same semantic APIs can be applied even when the data did not come from a JSON string at all.

That means you can:

- navigate existing objects with path APIs
- apply patch-like transformations to native object graphs
- validate runtime objects with JSON Schema

without first converting everything into an intermediate JSON tree.

## Does SJF4J support JSON Path, JSON Pointer, JSON Patch, and JSON Schema?

Yes. These are first-class parts of the library, not disconnected add-ons.

- **JSON Path**: RFC 9535
- **JSON Pointer**: RFC 6901
- **JSON Patch**: RFC 6902
- **JSON Merge Patch**: RFC 7386
- **JSON Schema**: Draft 2020-12

This is an important part of the product story: SJF4J is not only about reading and writing JSON. It is about using a single semantic model across query, mutation, and validation workflows.

## How fast is SJF4J, and what is the overhead?

The safest summary is: **SJF4J aims for minimal overhead, not universal benchmark wins**.

According to the project docs and JMH benchmarks:

- overhead is often described as modest, roughly around the single-digit to low double-digit range depending on workload
- Jackson and Fastjson2 can be near parity in some benchmark modes
- some Gson benchmarks are slightly favorable to SJF4J in the documented setup
- JSON Path and JSON Schema are treated as serious performance concerns, not just convenience features

What you should take away is not "SJF4J is always faster." The real claim is that it tries to add a richer semantic layer without paying a disproportionate cost.

## When is SJF4J a good fit?

SJF4J is especially attractive when at least one of these is true:

- you need **typed Java models plus dynamic JSON fields**
- you want **one abstraction** across multiple JSON backends
- you need **path, patch, and schema** on the same data model
- you work with **mixed sources** such as JSON, YAML, Properties, and in-memory objects
- you want to avoid bouncing between separate tree models, binders, and validators

In short: it is a strong fit when structured data is central to the application, not just an input format.

## What Java version is required?

SJF4J requires only **JDK 8** and has no external dependencies.

## How should I start if I want to evaluate SJF4J seriously?

A practical evaluation path is:

1. Start with [Getting Started](/docs/getting_started)
2. Read [Modeling (OBNT)](/docs/modeling) to understand the core mental model
3. Compare `POJO`, `JOJO`, and raw nodes for your own payload shape
4. Check [Navigating](/docs/navigating), [Patching](/docs/patching), and [Validating](/docs/validating) if your workflow goes beyond parsing
5. Review [Benchmarks](/docs/benchmarks) with your own workload in mind

That path usually makes it clear whether SJF4J is just interesting, or genuinely useful for your application architecture.

## How do I contribute or ask deeper questions?

Feel free to [open an issue](https://github.com/sjf4j-projects/sjf4j/issues/new) for questions, bug reports, ideas, documentation gaps, or design discussion.

Contributions of code, docs, examples, benchmarks, and careful feedback are all valuable.

Licensed under the [MIT License](https://opensource.org/licenses/MIT).
