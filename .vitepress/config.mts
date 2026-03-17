import { defineConfig } from 'vitepress'
import { withMermaid } from 'vitepress-plugin-mermaid'

const SITE_URL = 'https://sjf4j.org'
const OG_IMAGE_URL = `${SITE_URL}/logo-512.png`

function normalizePath(relativePath: string): string {
  if (relativePath === 'index.md') {
    return '/'
  }
  if (relativePath.endsWith('/index.md')) {
    return `/${relativePath.slice(0, -'index.md'.length)}`
  }
  if (relativePath.endsWith('.md')) {
    return `/${relativePath.slice(0, -'.md'.length)}`
  }
  return `/${relativePath}`
}

export default withMermaid(defineConfig({
  title: 'SJF4J',
  description: 'Simple JSON Facade for Java — A Unified JSON Semantic Layer',
  cleanUrls: true,
  ignoreDeadLinks: false,
  srcExclude: ['README.md'],

  head: [
    ['link', { rel: 'icon', type: 'image/png', sizes: '32x32', href: '/favicon-32.png?v=3' }],
    ['link', { rel: 'icon', type: 'image/svg+xml', href: '/favicon.svg?v=3' }],
    ['link', { rel: 'apple-touch-icon', sizes: '192x192', href: '/favicon-192.png?v=3' }],
    ['link', { rel: 'shortcut icon', href: '/favicon-32.png?v=3' }],
    ['script', { async: '', src: 'https://www.googletagmanager.com/gtag/js?id=G-KBSJRCWQ4V' }],
    ['script', {}, `
      window.dataLayer = window.dataLayer || [];
      function gtag(){dataLayer.push(arguments);}
      gtag('js', new Date());
      gtag('config', 'G-KBSJRCWQ4V');
    `],
    ['meta', { name: 'author', content: 'sjf4j-projects' }],
    ['meta', { name: 'robots', content: 'index, follow, max-snippet:-1, max-image-preview:large, max-video-preview:-1' }],
    ['meta', { property: 'og:title', content: 'SJF4J — Simple JSON Facade for Java' }],
    ['meta', { property: 'og:description', content: 'Enjoying JSON-oriented Java development. A simple facade over multiple JSON libraries with a unified semantic layer.' }],
    ['meta', { property: 'og:type', content: 'website' }],
    ['meta', { property: 'og:image', content: OG_IMAGE_URL }],
    ['meta', { property: 'og:site_name', content: 'SJF4J' }],
    ['meta', { name: 'twitter:card', content: 'summary' }],
    ['meta', { name: 'twitter:title', content: 'SJF4J — Simple JSON Facade for Java' }],
    ['meta', { name: 'twitter:description', content: 'Enjoying JSON-oriented Java development. A simple facade over multiple JSON libraries with a unified semantic layer.' }],
    ['meta', { name: 'twitter:image', content: OG_IMAGE_URL }],
    ['script', { type: 'application/ld+json' }, JSON.stringify({
      '@context': 'https://schema.org',
      '@type': 'SoftwareApplication',
      name: 'SJF4J',
      applicationCategory: 'DeveloperApplication',
      operatingSystem: 'Cross-platform',
      description: 'Simple JSON Facade for Java - a unified semantic layer for structured data processing.',
      url: SITE_URL,
      codeRepository: 'https://github.com/sjf4j-projects/sjf4j',
      license: 'https://opensource.org/licenses/MIT',
    })],
  ],

  sitemap: {
    hostname: SITE_URL,
  },

  transformHead({ pageData, title, description }) {
    const pagePath = normalizePath(pageData.relativePath)
    const canonical = new URL(pagePath, SITE_URL).toString()
    const ldType = pagePath.startsWith('/docs/') ? 'TechArticle' : 'WebPage'

    return [
      ['link', { rel: 'canonical', href: canonical }],
      ['meta', { property: 'og:url', content: canonical }],
      ['meta', { property: 'og:title', content: title }],
      ['meta', { property: 'og:description', content: description }],
      ['meta', { property: 'og:image', content: OG_IMAGE_URL }],
      ['meta', { name: 'twitter:title', content: title }],
      ['meta', { name: 'twitter:description', content: description }],
      ['meta', { name: 'twitter:image', content: OG_IMAGE_URL }],
      ['script', { type: 'application/ld+json' }, JSON.stringify({
        '@context': 'https://schema.org',
        '@type': ldType,
        headline: title,
        description,
        url: canonical,
        isPartOf: {
          '@type': 'WebSite',
          name: 'SJF4J',
          url: SITE_URL,
        },
      })],
    ]
  },

  themeConfig: {
    logo: '/favicon.svg?v=3',
    siteTitle: 'SJF4J',

    nav: [
      { text: 'Home', link: '/' },
      { text: 'Docs', link: '/docs/getting_started' },
      { text: 'GitHub', link: 'https://github.com/sjf4j-projects/sjf4j' },
    ],

    sidebar: [
      {
        text: 'Guide',
        items: [
          { text: 'Getting Started', link: '/docs/getting_started' },
          { text: 'Benchmarks', link: '/docs/benchmarks' },
          { text: 'Changelog', link: '/docs/changelog' },
        ],
      },
      {
        text: 'Modules',
        items: [
          { text: 'Modeling (OBNT)', link: '/docs/modeling' },
          { text: 'Parsing (Codec)', link: '/docs/parsing' },
          { text: 'Navigation (JSON Path)', link: '/docs/navigation' },
          { text: 'Transformation (JSON Patch)', link: '/docs/transformation' },
          { text: 'Validation (JSON Schema)', link: '/docs/validation' }
        ],
      },
      {
        text: 'Reference',
        items: [
          { text: 'Javadocs', link: 'https://javadoc.io/doc/org.sjf4j/sjf4j' },
          { text: 'Bowtie', link: 'https://bowtie.report/#/implementations/java-sjf4j' }
        ],
      },
    ],

    socialLinks: [
      { icon: 'github', link: 'https://github.com/sjf4j-projects/sjf4j' },
    ],

    outline: {
      level: [2, 3],
    },

    footer: {
      message: 'Released under the <a href="https://opensource.org/licenses/MIT" target="_blank" rel="noreferrer">MIT License</a>. JSON Specs: <a href="https://www.rfc-editor.org/rfc/rfc8259" target="_blank" rel="noreferrer">RFC 8259</a> | <a href="https://www.rfc-editor.org/rfc/rfc6901" target="_blank" rel="noreferrer">RFC 6901</a> | <a href="https://www.rfc-editor.org/rfc/rfc6902" target="_blank" rel="noreferrer">RFC 6902</a> | <a href="https://www.rfc-editor.org/rfc/rfc7386" target="_blank" rel="noreferrer">RFC 7386</a> | <a href="https://www.rfc-editor.org/rfc/rfc9535" target="_blank" rel="noreferrer">RFC 9535</a> | <a href="https://json-schema.org" target="_blank" rel="noreferrer">JSON Schema</a>',
      copyright: '© 2026 sjf4j.org',
    },

    search: {
      provider: 'local',
    },
  },
}))
