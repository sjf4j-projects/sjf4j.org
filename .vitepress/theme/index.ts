import DefaultTheme from 'vitepress/theme'
import { h } from 'vue'
import type { Theme } from 'vitepress'
import MavenInstallSnippet from './components/MavenInstallSnippet.vue'
import MermaidRuntime from './components/MermaidRuntime.vue'
import SchemaToJavaPlayground from './components/SchemaToJavaPlayground.vue'
import './custom.css'

const theme: Theme = {
  extends: DefaultTheme,
  enhanceApp({ app }) {
    app.component('MavenInstallSnippet', MavenInstallSnippet)
    app.component('Mermaid', MermaidRuntime)
    app.component('SchemaToJavaPlayground', SchemaToJavaPlayground)
  },
  Layout: () =>
    h(DefaultTheme.Layout, null, {
      'home-hero-info-after': () =>
        h('div', { class: 'hero-badges' }, [
          h(
            'a',
            {
              href: 'https://github.com/sjf4j-projects/sjf4j/blob/main/LICENSE',
              target: '_blank',
              rel: 'noreferrer',
            },
            [
              h('img', {
                alt: 'License',
                src: 'https://img.shields.io/github/license/sjf4j-projects/sjf4j',
              }),
            ]
          ),
          h(
            'a',
            {
              href: 'https://bowtie.report/#/implementations/java-sjf4j',
              target: '_blank',
              rel: 'noreferrer',
            },
            [
              h('img', {
                alt: 'Supported Dialects',
                src: 'https://img.shields.io/endpoint?url=https%3A%2F%2Fbowtie.report%2Fbadges%2Fjava-org.sjf4j-sjf4j%2Fsupported_versions.json',
              }),
            ]
          ),
          h(
            'a',
            {
              href: 'https://search.maven.org/artifact/org.sjf4j/sjf4j',
              target: '_blank',
              rel: 'noreferrer',
            },
            [
              h('img', {
                alt: 'Maven Central',
                src: 'https://img.shields.io/maven-central/v/org.sjf4j/sjf4j',
              }),
            ]
          ),
          h(
            'a',
            {
              href: 'https://github.com/sjf4j-projects/sjf4j/stargazers',
              target: '_blank',
              rel: 'noreferrer',
            },
            [
              h('img', {
                alt: 'GitHub',
                src: 'https://img.shields.io/github/stars/sjf4j-projects/sjf4j?style=social',
              }),
            ]
          ),
        ]),
    }),
}

export default theme
