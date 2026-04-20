import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { generateJavaOutput, parseSchemaText, type GeneratorOptions } from '../../.vitepress/theme/generator/core'

const testDir = fileURLToPath(new URL('.', import.meta.url))

function readFixture(name: string, fileName: string): string {
  return readFileSync(resolve(testDir, 'fixtures', name, fileName), 'utf-8')
}

describe('generator fixture smoke', () => {
  it('renders the simple order fixture', () => {
    const schemaText = readFixture('simple-order', 'schema.json')
    const options = JSON.parse(readFixture('simple-order', 'options.json')) as GeneratorOptions
    const expected = readFixture('simple-order', 'expected.java')

    const parsedSchema = parseSchemaText(schemaText)
    const output = generateJavaOutput(parsedSchema, options)

    expect(output.error).toBe('')
    expect(output.code).toBe(expected)
  })
})
