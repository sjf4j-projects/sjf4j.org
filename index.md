---
layout: home

hero:
  name: SJF4J
  text: Simple JSON Facade for Java
  tagline: A unified JSON-semantic structural processing layer
  actions:
    - theme: brand
      text: Getting Started
      link: /docs/getting_started
    - theme: alt
      text: "⚡ Benchmarks"
      link: /docs/benchmarks
---

<div class="vp-doc" style="max-width: 1120px; margin: 0 auto; padding: 0.1rem 1.5rem 2rem;">

## Quick Install
SJF4J requires `JDK 8` and has no external dependencies.

<MavenInstallSnippet />

## Features

<div class="feature-grid">
  <div class="feature-card">
    <h3>🌳 Modeling (OBNT)</h3>
    <p>Defines a unified object model where typed Java fields and dynamic JSON structures coexist.</p>
    <a href="/docs/modeling">Learn more</a>
  </div>
  <div class="feature-card">
    <h3>📦 Parsing (JSON / YAML)</h3>
    <p>Provides a unified facade for parsing and serialization across multiple formats.</p>
    <a href="/docs/parsing">Learn more</a>
  </div>
  <div class="feature-card">
    <h3>🔭 Navigating (JSON Path)</h3>
    <p>Enables declarative querying and precise navigation over object graphs using JSON Path.</p>
    <a href="/docs/navigating">Learn more</a>
  </div>
  <div class="feature-card">
    <h3>🔧 Patching (JSON Patch)</h3>
    <p>Applies in-place structural updates using JSON Patch operations.</p>
    <a href="/docs/patching">Learn more</a>
  </div>
  <div class="feature-card">
    <h3>✅ Validating (JSON Schema)</h3>
    <p>Validates data against JSON Schema with full structural and semantic constraint support.</p>
    <a href="/docs/validating">Learn more</a>
  </div>
  <div class="feature-card">
    <h3>🔀 Mapping</h3>
    <p>Object graph mapping and transformation, supporting DTO projection.</p>
    <a href="/docs/benchmarks">Learn more</a>
  </div>
</div>

<div style="display:flex; gap:0.75rem; flex-wrap:wrap; margin-top:1.5rem;">
  <a href="/docs/modeling" class="vp-link" style="display:inline-flex;align-items:center;gap:0.4rem;padding:0.55rem 1.25rem;border-radius:8px;font-size:0.9rem;font-weight:600;background:var(--vp-c-brand-1);color:var(--vp-c-white);">Explore Java JSON docs -&gt;</a>
</div>

<style>
.feature-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 0.9rem;
  margin-top: 0.9rem;
}

.vp-doc .feature-card {
  display: flex;
  flex-direction: column;
  border: 1px solid var(--vp-c-divider);
  border-radius: 12px;
  background: var(--vp-c-bg-soft);
  padding: 0.9rem 1.05rem;
}

.vp-doc .feature-card > :first-child {
  margin-top: 0 !important;
}

.vp-doc .feature-card h3 {
  margin: 0 0 0.45rem !important;
  font-size: 1rem;
  line-height: 1.35;
}

.feature-card p {
  margin: 0 0 0.55rem;
  color: var(--vp-c-text-2);
  font-size: 0.92rem;
  line-height: 1.55;
}

.feature-card a {
  margin-top: auto;
  color: var(--vp-c-brand-1);
  text-decoration: none !important;
  border-bottom: 0 !important;
  font-weight: 600;
}

.feature-card a:hover {
  text-decoration: underline !important;
}

@media (max-width: 1100px) {
  .feature-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 768px) {
  .feature-grid {
    grid-template-columns: 1fr;
  }
}
</style>

</div>
