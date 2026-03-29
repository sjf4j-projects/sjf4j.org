import { defineConfig } from 'vitepress'
import { withMermaid } from 'vitepress-plugin-mermaid'

const SITE_NAME = 'SJF4J'
const SITE_URL = 'https://sjf4j.org'
const GITHUB_URL = 'https://github.com/sjf4j-projects/sjf4j'
const LICENSE_URL = 'https://opensource.org/licenses/MIT'
const DOCS_URL = `${SITE_URL}/docs/getting_started`
const OG_IMAGE_URL = `${SITE_URL}/logo-512.png`
const OG_IMAGE_ALT = 'SJF4J logo'
const DEFAULT_DESCRIPTION = 'SJF4J is a Java JSON library that unifies JSON Path, JSON Patch, JSON Schema, YAML, and object mapping behind one semantic API.'
const ORGANIZATION_SCHEMA = {
  '@type': 'Organization',
  name: SITE_NAME,
  url: SITE_URL,
  logo: OG_IMAGE_URL,
  sameAs: [GITHUB_URL],
}
const WEBSITE_SCHEMA = {
  '@type': 'WebSite',
  name: SITE_NAME,
  url: SITE_URL,
  description: DEFAULT_DESCRIPTION,
  publisher: {
    '@type': 'Organization',
    name: SITE_NAME,
    url: SITE_URL,
  },
}
const FAQ_ENTRIES = [
  {
    question: 'What is SJF4J?',
    answer: 'SJF4J is a Java JSON facade that unifies parsing, modeling, navigation, transformation, and validation across multiple JSON libraries.',
  },
  {
    question: 'What Java version is required?',
    answer: 'SJF4J requires JDK 8 and has no external dependencies.',
  },
  {
    question: 'Which JSON parsers are supported?',
    answer: 'SJF4J supports Jackson, Gson, Fastjson2, JSON-P, and a built-in fallback parser when no external parser is present.',
  },
  {
    question: 'Does SJF4J support formats other than JSON?',
    answer: 'Yes. SJF4J also supports YAML, Java Properties, and direct in-memory object graph processing through OBNT.',
  },
  {
    question: 'What is the performance overhead?',
    answer: 'SJF4J typically adds modest overhead while providing a unified semantic API. The benchmarks page includes detailed JMH results.',
  },
]

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

function stripTitleSuffix(title: string): string {
  const suffix = ` | ${SITE_NAME}`
  return title.endsWith(suffix) ? title.slice(0, -suffix.length) : title
}

function buildBreadcrumbSchema(pagePath: string, pageTitle: string, canonical: string) {
  const items = [
    {
      '@type': 'ListItem',
      position: 1,
      name: 'Home',
      item: SITE_URL,
    },
  ]

  if (pagePath.startsWith('/docs/')) {
    items.push({
      '@type': 'ListItem',
      position: 2,
      name: 'Docs',
      item: DOCS_URL,
    })
  }

  if (pagePath !== '/') {
    items.push({
      '@type': 'ListItem',
      position: items.length + 1,
      name: pageTitle,
      item: canonical,
    })
  }

  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items,
  }
}

function buildPageSchema(pagePath: string, pageTitle: string, description: string, canonical: string) {
  if (pagePath === '/') {
    return {
      '@context': 'https://schema.org',
      '@type': 'SoftwareApplication',
      name: SITE_NAME,
      headline: pageTitle,
      applicationCategory: 'DeveloperApplication',
      operatingSystem: 'Cross-platform',
      description,
      url: canonical,
      image: OG_IMAGE_URL,
      codeRepository: GITHUB_URL,
      license: LICENSE_URL,
      publisher: ORGANIZATION_SCHEMA,
    }
  }

  if (pagePath === '/404') {
    return {
      '@context': 'https://schema.org',
      '@type': 'WebPage',
      name: pageTitle,
      headline: pageTitle,
      description,
      url: canonical,
      isPartOf: {
        '@type': 'WebSite',
        name: SITE_NAME,
        url: SITE_URL,
      },
    }
  }

  if (pagePath === '/docs/faq') {
    return {
      '@context': 'https://schema.org',
      '@type': 'FAQPage',
      name: pageTitle,
      headline: pageTitle,
      description,
      url: canonical,
      publisher: ORGANIZATION_SCHEMA,
      mainEntity: FAQ_ENTRIES.map(({ question, answer }) => ({
        '@type': 'Question',
        name: question,
        acceptedAnswer: {
          '@type': 'Answer',
          text: answer,
        },
      })),
    }
  }

  return {
    '@context': 'https://schema.org',
    '@type': pagePath === '/docs/changelog' ? 'CollectionPage' : 'TechArticle',
    headline: pageTitle,
    description,
    url: canonical,
    mainEntityOfPage: canonical,
    about: {
      '@type': 'SoftwareApplication',
      name: SITE_NAME,
      url: SITE_URL,
    },
    isPartOf: {
      '@type': 'WebSite',
      name: SITE_NAME,
      url: SITE_URL,
    },
    publisher: ORGANIZATION_SCHEMA,
  }
}

export default withMermaid(defineConfig({
  lang: 'en-US',
  title: SITE_NAME,
  description: DEFAULT_DESCRIPTION,
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
    ['meta', { property: 'og:site_name', content: 'SJF4J' }],
    ['meta', { property: 'og:locale', content: 'en_US' }],
    ['meta', { property: 'og:image', content: OG_IMAGE_URL }],
    ['meta', { property: 'og:image:alt', content: OG_IMAGE_ALT }],
    ['meta', { property: 'og:image:width', content: '512' }],
    ['meta', { property: 'og:image:height', content: '512' }],
    ['meta', { name: 'twitter:card', content: 'summary' }],
    ['meta', { name: 'twitter:image', content: OG_IMAGE_URL }],
    ['meta', { name: 'twitter:image:alt', content: OG_IMAGE_ALT }],
    ['script', { type: 'application/ld+json' }, JSON.stringify({
      '@context': 'https://schema.org',
      '@graph': [ORGANIZATION_SCHEMA, WEBSITE_SCHEMA],
    })],
  ],

  sitemap: {
    hostname: SITE_URL,
  },

  transformHead({ pageData, title, description }) {
    const pagePath = normalizePath(pageData.relativePath)
    const canonical = new URL(pagePath, SITE_URL).toString()
    const pageTitle = stripTitleSuffix(title)
    const pageDescription = description || DEFAULT_DESCRIPTION
    const robots = pagePath === '/404'
      ? 'noindex, nofollow, noarchive'
      : 'index, follow, max-snippet:-1, max-image-preview:large, max-video-preview:-1'
    const ogType = pagePath === '/' || pagePath === '/404' ? 'website' : 'article'

    return [
      ['link', { rel: 'canonical', href: canonical }],
      ['meta', { name: 'robots', content: robots }],
      ['meta', { property: 'og:type', content: ogType }],
      ['meta', { property: 'og:url', content: canonical }],
      ['meta', { property: 'og:title', content: pageTitle }],
      ['meta', { property: 'og:description', content: pageDescription }],
      ['meta', { property: 'og:image', content: OG_IMAGE_URL }],
      ['meta', { property: 'og:image:alt', content: OG_IMAGE_ALT }],
      ['meta', { name: 'twitter:title', content: pageTitle }],
      ['meta', { name: 'twitter:description', content: pageDescription }],
      ['meta', { name: 'twitter:image', content: OG_IMAGE_URL }],
      ['meta', { name: 'twitter:image:alt', content: OG_IMAGE_ALT }],
      ['script', { type: 'application/ld+json' }, JSON.stringify(buildPageSchema(pagePath, pageTitle, pageDescription, canonical))],
      ['script', { type: 'application/ld+json' }, JSON.stringify(buildBreadcrumbSchema(pagePath, pageTitle, canonical))],
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
        text: 'Features',
        items: [
          { text: 'Modeling (OBNT)', link: '/docs/modeling' },
          { text: 'Parsing (JSON/YAML)', link: '/docs/parsing' },
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
