# sjf4j-org

Website: [sjf4j.org](https://sjf4j.org) — official documentation and landing page for [SJF4J](https://github.com/sjf4j-projects/sjf4j).

Built with [VitePress](https://vitepress.dev/). Documentation is written in Markdown and compiled to static HTML.

## Prerequisites

- [Node.js](https://nodejs.org/) 18+

## Setup

```bash
npm install
```

## Local Development

```bash
npm run docs:dev
```

Then open <http://localhost:5173> in your browser. Changes to `.md` files are reflected in real time.

## Build

```bash
npm run docs:build
```

The static site is generated into `.vitepress/dist/`.

## Preview Production Build

```bash
npm run docs:preview
```

## Writing Docs

All documentation lives in Markdown files:

| File | Content |
|---|---|
| `index.md` | Homepage |
| `docs/getting_started.md` | Docs landing page |
| `docs/modeling.md` | Modeling (OBNT) |
| `docs/parsing.md` | Parsing (Codec) |
| `docs/navigating.md` | Navigating (JSON Path) |
| `docs/patching.md` | Patching (JSON Patch) |
| `docs/validating.md` | Validating (JSON Schema) |
| `docs/benchmarks.md` | Benchmark results |
| `docs/faq.md` | FAQ |

## Adding a New Page

At minimum, adding a new page requires two steps — create the Markdown file and register it in the sidebar.

### Step 1 — Create the Markdown file

Add a new `.md` file under `docs/`. For example, `docs/new-feature.md`:

```markdown
# New Feature

Describe the new feature here. Standard Markdown is supported,
plus VitePress extensions like code groups, custom containers, etc.

## Section One

Regular text, **bold**, `inline code`, [links](https://example.com).

### Code Example

```java
JsonObject jo = JsonObject.fromJson("{\"hello\":\"world\"}");
```

::: tip
VitePress custom containers are supported — `tip`, `info`, `warning`, `danger`, `details`.
:::
```

### Step 2 — Register in the sidebar

Open `.vitepress/config.mts` and add an entry to the `sidebar` → `items` array:

```ts
sidebar: [
  {
    text: 'Guide',
    items: [
      { text: 'Getting Started', link: '/docs/getting_started' },
      { text: 'Benchmarks', link: '/docs/benchmarks' },
      { text: 'Modeling (OBNT)', link: '/docs/modeling' },
      { text: 'Parsing (Codec)', link: '/docs/parsing' },
      { text: 'Navigating (JSON Path)', link: '/docs/navigating' },
      { text: 'Patching (JSON Patch)', link: '/docs/patching' },
      { text: 'Validating (JSON Schema)', link: '/docs/validating' },
      // ...existing items...
      { text: 'New Feature', link: '/docs/new-feature' },   // ← add here
    ],
  },
],
```

### Step 3 — Preview locally

```bash
npm run docs:dev
```

Open <http://localhost:5173> — the new page appears in the sidebar instantly. Edits to the `.md` file are reflected in real time (hot reload).

### Step 4 — Push to deploy

```bash
git add docs/new-feature.md .vitepress/config.mts
git commit -m "docs: add new-feature page"
git push
```

For maintainers of this repository, pushing to the configured deploy branch triggers GitHub Actions (`.github/workflows/deploy.yml`) to build the VitePress site and deploy it to GitHub Pages automatically. If you are working from a fork or a feature branch, preview locally or open a PR instead.

### Summary

```
docs/new-feature.md          ← write Markdown here
.vitepress/config.mts        ← register in sidebar here
git push                     ← auto-build & deploy
```

That's it — you only write Markdown. VitePress compiles it to static HTML automatically.
