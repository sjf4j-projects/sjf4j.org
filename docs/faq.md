---
title: "SJF4J FAQ for Java JSON Development"
description: "Find answers about SJF4J, supported JSON parsers, YAML support, performance overhead, JOJO, Java requirements, and contributions."
---

# FAQ

## What is SJF4J?

**SJF4J (Simple JSON Facade for Java)** is a simple facade over multiple JSON libraries, providing a unified semantic layer for structured data processing grounded in JSON specifications. It sits on top of popular parsers — Jackson, Gson, Fastjson2 — and exposes a consistent, expressive API across all of them.

## What Java version is required?

SJF4J requires only **JDK 8** and has no external dependencies.

## Which JSON parsers are supported?

SJF4J supports **Jackson**, **Gson**, **Fastjson2**, and **JSON-P**. The first available parser on the classpath will be automatically used according to SJF4J's runtime selection rules. If none are detected, SJF4J falls back to its own simple built-in parser.

## Does SJF4J support formats other than JSON?

Yes. Besides JSON, SJF4J supports:
- **YAML** — via SnakeYAML (add it to your classpath)
- **Java Properties** — built-in parser
- **In-memory objects** — operate directly on object graphs via the OBNT without any external data

## What is the performance overhead?

Using SJF4J adds roughly **5–10% overhead** compared with native JSON libraries, while providing a unified API and extended functionality. See the [Benchmarks](/docs/benchmarks) page for detailed JMH results.

## What is JOJO?

**JOJO (JSON Object Java Object)** is a hybrid model that extends `JsonObject` while also behaving like a typed Java object. It combines dynamic JSON access with POJO safety — you get typed fields and methods plus full JSON-semantic APIs in a single class.

## Can I use SJF4J without parsing any external data?

Yes. SJF4J can operate directly on in-memory object graphs via the Object-Based Node Tree (OBNT), providing the same JSON-semantic APIs without any parsing step.

## How do I contribute?

Feel free to [open an issue](https://github.com/sjf4j-projects/sjf4j/issues/new) for questions, bugs, ideas, or simply to say hi — your interest already means a lot to this project.

Contributions of all kinds — code, documentation, examples, benchmarking, or simply filing an issue — are truly appreciated! ❤️

Licensed under the [MIT License](https://opensource.org/licenses/MIT).
