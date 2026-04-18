<script setup lang="ts">
import { computed, ref } from 'vue'

type ValidationNamespace = 'jakarta' | 'javax'
type AccessorMode = 'lombok' | 'methods' | 'none'
type FieldMemberKind = 'field' | 'property'

type GeneratorOptions = {
  packageName: string
  className: string
  accessorMode: AccessorMode
  useValidation: boolean
  validationNamespace: ValidationNamespace
  useBigDecimal: boolean
  addJavaDoc: boolean
}

type SchemaNode = {
  title?: string
  description?: string
  type?: string | string[]
  format?: string
  properties?: Record<string, SchemaNode>
  items?: SchemaNode
  required?: string[]
}

const exampleSchema = `{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "title": "Order",
  "description": "Checkout order created by the storefront.",
  "type": "object",
  "required": ["id", "amount", "createdAt", "customer", "items"],
  "properties": {
    "id": {
      "type": "string",
      "description": "Business order identifier."
    },
    "amount": {
      "type": "number",
      "description": "Total amount in the settlement currency."
    },
    "createdAt": {
      "type": "string",
      "format": "date-time"
    },
    "paid": {
      "type": "boolean"
    },
    "tags": {
      "type": "array",
      "items": {
        "type": "string"
      }
    },
    "customer": {
      "type": "object",
      "required": ["id", "profile"],
      "properties": {
        "id": {
          "type": "string"
        },
        "profile": {
          "type": "object",
          "required": ["email"],
          "properties": {
            "email": {
              "type": "string"
            },
            "loyaltyTier": {
              "type": "string"
            }
          }
        }
      }
    },
    "shipping": {
      "type": "object",
      "properties": {
        "address": {
          "type": "object",
          "properties": {
            "city": {
              "type": "string"
            },
            "country": {
              "type": "string"
            }
          }
        }
      }
    },
    "items": {
      "type": "array",
      "items": {
        "type": "object",
        "required": ["sku", "quantity"],
        "properties": {
          "sku": {
            "type": "string"
          },
          "quantity": {
            "type": "integer"
          },
          "pricing": {
            "type": "object",
            "properties": {
              "unitPrice": {
                "type": "number"
              }
            }
          }
        }
      }
    },
    "metadata": {
      "type": "object",
      "description": "Opaque integration-specific values."
    }
  }
}`

const schemaInput = ref(exampleSchema)
const options = ref<GeneratorOptions>({
  packageName: 'org.example.generated',
  className: '',
  accessorMode: 'lombok',
  useValidation: true,
  validationNamespace: 'jakarta',
  useBigDecimal: true,
  addJavaDoc: true,
})
const toastMessage = ref('')
const copyButtonLabel = ref('Copy')
const inputHighlightRef = ref<HTMLElement | null>(null)
const fieldOverrides = ref<Record<string, { memberKind: FieldMemberKind; generateAccessors: boolean }>>({})

function showToast(message: string) {
  toastMessage.value = message
  window.setTimeout(() => {
    if (toastMessage.value === message) {
      toastMessage.value = ''
    }
  }, 2200)
}

function detectObject(input: unknown): SchemaNode {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new Error('Top-level schema must be a JSON object.')
  }
  return input as SchemaNode
}

function toPascalCase(value: string): string {
  const normalized = value
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[^a-zA-Z0-9]+/g, ' ')
    .trim()

  const words = normalized.split(/\s+/).filter(Boolean)
  const result = words
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join('')

  return result || 'GeneratedType'
}

function toCamelCase(value: string): string {
  const pascal = toPascalCase(value)
  return pascal.charAt(0).toLowerCase() + pascal.slice(1)
}

function escapeJavaDoc(value: string): string {
  return value.replace(/\*\//g, '*\\/')
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

function highlightJava(code: string): string {
  const placeholders: string[] = []
  const stash = (value: string, className: string) => {
    const token = `@@TOKEN_${placeholders.length}@@`
    placeholders.push(`<span class="${className}">${escapeHtml(value)}</span>`)
    return token
  }

  let html = code
    .replace(/\/\*\*[\s\S]*?\*\/|\/\*[\s\S]*?\*\/|\/\/.*$/gm, (match) => stash(match, 'token-comment'))
    .replace(/"(?:\\.|[^"\\])*"/g, (match) => stash(match, 'token-string'))

  html = escapeHtml(html)

  html = html
    .replace(/\b(package|import|public|private|class|return|void)\b/g, '<span class="token-keyword">$1</span>')
    .replace(/(^|[\s(])(@[A-Za-z_]\w*)/gm, '$1<span class="token-annotation">$2</span>')
    .replace(/\b(class)(\s+)([A-Z][A-Za-z0-9_]*)\b/g, '<span class="token-keyword">$1</span>$2<span class="token-class">$3</span>')

  placeholders.forEach((value, index) => {
    html = html.replace(`@@TOKEN_${index}@@`, value)
  })

  return html
}

function highlightJson(code: string): string {
  const escaped = escapeHtml(code)

  return escaped
    .replace(/("(?:\\.|[^"\\])*?")(?=\s*:)/g, '<span class="token-json-key">$1</span>')
    .replace(/:\s*("(?:\\.|[^"\\])*")/g, ': <span class="token-string">$1</span>')
    .replace(/\b(true|false)\b/g, '<span class="token-json-boolean">$1</span>')
    .replace(/\b(null)\b/g, '<span class="token-json-null">$1</span>')
    .replace(/\b(-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)\b/g, '<span class="token-json-number">$1</span>')
}

function mapSchemaType(node: SchemaNode | undefined, useBigDecimal: boolean): { typeName: string; imports: string[] } {
  const declared = Array.isArray(node?.type)
    ? node?.type.find((entry) => entry !== 'null')
    : node?.type

  switch (declared) {
    case 'string':
      if (node?.format === 'date') {
        return { typeName: 'LocalDate', imports: ['java.time.LocalDate'] }
      }
      if (node?.format === 'date-time') {
        return { typeName: 'OffsetDateTime', imports: ['java.time.OffsetDateTime'] }
      }
      return { typeName: 'String', imports: [] }
    case 'integer':
      return { typeName: 'Long', imports: [] }
    case 'number':
      return useBigDecimal
        ? { typeName: 'BigDecimal', imports: ['java.math.BigDecimal'] }
        : { typeName: 'Double', imports: [] }
    case 'boolean':
      return { typeName: 'Boolean', imports: [] }
    case 'array': {
      const item = mapSchemaType(node?.items, useBigDecimal)
      return {
        typeName: `List<${item.typeName}>`,
        imports: ['java.util.List', ...item.imports],
      }
    }
    case 'object':
      return { typeName: 'Map<String, Object>', imports: ['java.util.Map'] }
    default:
      return { typeName: 'Object', imports: [] }
  }
}

function schemaTypeLabel(node: SchemaNode | undefined): string {
  const declared = Array.isArray(node?.type)
    ? node.type.filter((entry) => entry !== 'null').join(' | ')
    : node?.type || 'unknown'

  if (declared === 'string' && node?.format) {
    return `${declared} (${node.format})`
  }

  return declared
}

function collectSchemaFields(
  node: SchemaNode | undefined,
  useBigDecimal: boolean,
  path = '',
  required = false,
): Array<{ path: string; javaType: string; schemaType: string; required: boolean }> {
  if (!node) {
    return []
  }

  const typeLabel = schemaTypeLabel(node)
  const mapped = mapSchemaType(node, useBigDecimal)
  const fields = [{ path, javaType: mapped.typeName, schemaType: typeLabel, required }]

  const declared = Array.isArray(node.type)
    ? node.type.find((entry) => entry !== 'null')
    : node.type

  if (declared === 'object' && node.properties) {
    const requiredSet = new Set(node.required || [])
    return [
      ...fields,
      ...Object.entries(node.properties).flatMap(([name, child]) =>
        collectSchemaFields(child, useBigDecimal, `${path}/${name}`, requiredSet.has(name)),
      ),
    ]
  }

  if (declared === 'array' && node.items) {
    return [
      ...fields,
      ...collectSchemaFields(node.items, useBigDecimal, `${path}/0`, false),
    ]
  }

  return fields
}

function renderJava(schema: SchemaNode, generatorOptions: GeneratorOptions): string {
  const normalizedClassName = generatorOptions.className.trim()
    ? toPascalCase(generatorOptions.className)
    : toPascalCase(schema.title || 'GeneratedType')

  const properties = schema.properties || {}
  const required = new Set(schema.required || [])
  const imports = new Set<string>()

  const fields = Object.entries(properties).map(([propertyName, propertySchema]) => {
    const mapped = mapSchemaType(propertySchema, generatorOptions.useBigDecimal)
    mapped.imports.forEach((entry) => imports.add(entry))

    if (generatorOptions.useValidation && required.has(propertyName)) {
      imports.add(`${generatorOptions.validationNamespace}.validation.constraints.NotNull`)
    }

    return {
      propertyName,
      fieldName: toCamelCase(propertyName),
      description: propertySchema.description,
      typeName: mapped.typeName,
      required: required.has(propertyName),
    }
  })

  if (generatorOptions.accessorMode === 'lombok') {
    imports.add('lombok.AllArgsConstructor')
    imports.add('lombok.Builder')
    imports.add('lombok.Data')
    imports.add('lombok.NoArgsConstructor')
  }

  const importBlock = Array.from(imports)
    .sort((left, right) => left.localeCompare(right))
    .map((entry) => `import ${entry};`)
    .join('\n')

  const packageLine = generatorOptions.packageName.trim()
    ? `package ${generatorOptions.packageName.trim()};\n\n`
    : ''

  const classDocs = generatorOptions.addJavaDoc && schema.description
    ? `/**\n * ${escapeJavaDoc(schema.description)}\n */\n`
    : ''

  const classAnnotations = generatorOptions.accessorMode === 'lombok'
    ? '@Data\n@Builder\n@NoArgsConstructor\n@AllArgsConstructor\n'
    : ''

  const fieldBlock = fields.length > 0
    ? fields.map((field) => {
      const javaDoc = generatorOptions.addJavaDoc && field.description
        ? `    /** ${escapeJavaDoc(field.description)} */\n`
        : ''
      const validation = generatorOptions.useValidation && field.required
        ? '    @NotNull\n'
        : ''

      return `${javaDoc}${validation}    private ${field.typeName} ${field.fieldName};`
    }).join('\n\n')
    : '    // TODO: map schema properties into Java fields.'

  const accessors = generatorOptions.accessorMode === 'methods' && fields.length > 0
    ? `\n\n${fields.map((field) => {
      const methodName = field.fieldName.charAt(0).toUpperCase() + field.fieldName.slice(1)
      return `    public ${field.typeName} get${methodName}() {\n        return ${field.fieldName};\n    }\n\n    public void set${methodName}(${field.typeName} ${field.fieldName}) {\n        this.${field.fieldName} = ${field.fieldName};\n    }`
    }).join('\n\n')}`
    : ''

  return `${packageLine}${importBlock ? `${importBlock}\n\n` : ''}${classDocs}${classAnnotations}public class ${normalizedClassName} {\n${fieldBlock}${accessors}\n}\n`
}

const parsedSchema = computed(() => {
  try {
    return detectObject(JSON.parse(schemaInput.value))
  } catch (error) {
    return error instanceof Error ? error.message : 'Invalid JSON input.'
  }
})

const resolvedClassName = computed(() => {
  if (typeof parsedSchema.value === 'string') {
    return toPascalCase(options.value.className || 'GeneratedType')
  }

  return options.value.className.trim()
    ? toPascalCase(options.value.className)
    : toPascalCase(parsedSchema.value.title || 'GeneratedType')
})

const generatedOutput = computed(() => {
  if (typeof parsedSchema.value === 'string') {
    return {
      code: '',
      error: parsedSchema.value,
    }
  }

  return {
    code: renderJava(parsedSchema.value, options.value),
    error: '',
  }
})

const schemaStats = computed(() => {
  const lines = schemaInput.value.split('\n').length
  const characters = schemaInput.value.length
  return `${lines} lines · ${characters} chars`
})

const outputStats = computed(() => {
  if (!generatedOutput.value.code) {
    return 'No output yet'
  }
  const lines = generatedOutput.value.code.split('\n').length
  const characters = generatedOutput.value.code.length
  return `${lines} lines · ${characters} chars`
})

const outputHeaderMeta = computed(() => `${resolvedClassName.value}.java · ${outputStats.value}`)

const parsedFieldList = computed(() => {
  if (typeof parsedSchema.value === 'string') {
    return []
  }

  return collectSchemaFields(parsedSchema.value, options.value.useBigDecimal)
    .filter((field) => field.path !== '')
    .map((field) => {
    const override = fieldOverrides.value[field.path] || {
      memberKind: 'field' as FieldMemberKind,
      generateAccessors: false,
    }

    return {
      path: field.path,
      javaType: field.javaType,
      schemaType: field.schemaType,
      required: field.required,
      memberKind: override.memberKind,
      generateAccessors: override.generateAccessors,
    }
  })
})

const highlightedInput = computed(() => highlightJson(schemaInput.value))
const highlightedOutput = computed(() => highlightJava(generatedOutput.value.code))

function syncInputHighlight(event: Event) {
  const target = event.target as HTMLTextAreaElement
  if (!inputHighlightRef.value) {
    return
  }

  inputHighlightRef.value.scrollTop = target.scrollTop
  inputHighlightRef.value.scrollLeft = target.scrollLeft
}

function updateFieldMemberKind(name: string, memberKind: FieldMemberKind) {
  fieldOverrides.value = {
    ...fieldOverrides.value,
    [name]: {
      memberKind,
      generateAccessors: fieldOverrides.value[name]?.generateAccessors || false,
    },
  }
}

function updateFieldAccessors(name: string, generateAccessors: boolean) {
  fieldOverrides.value = {
    ...fieldOverrides.value,
    [name]: {
      memberKind: fieldOverrides.value[name]?.memberKind || 'field',
      generateAccessors,
    },
  }
}

function handleFieldMemberKindChange(name: string, event: Event) {
  updateFieldMemberKind(name, (event.target as HTMLSelectElement).value as FieldMemberKind)
}

function handleFieldAccessorChange(name: string, event: Event) {
  updateFieldAccessors(name, (event.target as HTMLInputElement).checked)
}

function loadExample() {
  schemaInput.value = exampleSchema
  showToast('Loaded example schema.')
}

function formatInput() {
  try {
    schemaInput.value = JSON.stringify(JSON.parse(schemaInput.value), null, 2)
    showToast('Formatted JSON input.')
  } catch {
    showToast('Input is not valid JSON.')
  }
}

function resetOptions() {
  options.value = {
    packageName: 'org.example.generated',
    className: '',
    accessorMode: 'lombok',
    useValidation: true,
    validationNamespace: 'jakarta',
    useBigDecimal: true,
    addJavaDoc: true,
  }
  fieldOverrides.value = {}
  showToast('Generator options reset.')
}

async function copyOutput() {
  if (!generatedOutput.value.code) {
    showToast('Nothing to copy yet.')
    return
  }

  try {
    await navigator.clipboard.writeText(generatedOutput.value.code)
    copyButtonLabel.value = 'Copied'
    window.setTimeout(() => {
      copyButtonLabel.value = 'Copy'
    }, 1600)
    showToast('Copied Java output.')
  } catch {
    showToast('Clipboard access is unavailable.')
  }
}

function downloadOutput() {
  if (!generatedOutput.value.code) {
    showToast('Nothing to download yet.')
    return
  }

  const fileName = `${resolvedClassName.value}.java`
  const blob = new Blob([generatedOutput.value.code], { type: 'text/plain;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = fileName
  link.click()
  URL.revokeObjectURL(url)
  showToast(`Downloaded ${fileName}.`)
}
</script>

<template>
  <section class="generator-shell">
    <div class="generator-simple-header">
      <h1>Generate Java from JSON Schema</h1>
    </div>

    <section class="generator-card generator-controls">
      <button type="button" class="generator-text-button generator-reset-floating" @click="resetOptions">Reset</button>

      <div class="generator-controls-grid">
        <label class="generator-field">
          <span>Package name</span>
          <input v-model="options.packageName" type="text" placeholder="org.example.generated" />
        </label>

        <label class="generator-field">
          <span>Class name override</span>
          <input v-model="options.className" type="text" placeholder="Leave empty to use schema.title" />
        </label>

        <label class="generator-field">
          <span>Validation namespace</span>
          <select v-model="options.validationNamespace" :disabled="!options.useValidation">
            <option value="jakarta">jakarta.validation</option>
            <option value="javax">javax.validation</option>
          </select>
        </label>

        <label class="generator-field">
          <span>Accessor strategy</span>
          <select v-model="options.accessorMode">
            <option value="lombok">Lombok annotations</option>
            <option value="methods">Generate getters and setters</option>
            <option value="none">Fields only</option>
          </select>
        </label>
      </div>

      <div class="generator-toggle-grid">
        <label class="generator-toggle">
          <input v-model="options.useValidation" type="checkbox" />
          <span>
            <strong>Emit validation annotations</strong>
            <small>Map required properties to @NotNull</small>
          </span>
        </label>

        <label class="generator-toggle">
          <input v-model="options.useBigDecimal" type="checkbox" />
          <span>
            <strong>Prefer BigDecimal</strong>
            <small>Use BigDecimal instead of Double for schema numbers</small>
          </span>
        </label>

        <label class="generator-toggle">
          <input v-model="options.addJavaDoc" type="checkbox" />
          <span>
            <strong>Emit JavaDoc</strong>
            <small>Use schema descriptions for class and field comments</small>
          </span>
        </label>
      </div>

    </section>

    <div class="generator-workspace">
      <section class="generator-card generator-workspace-card">
        <div class="generator-card-header">
          <div>
            <p class="generator-card-kicker">JSON Schema Input</p>
          </div>
          <span class="generator-meta">{{ schemaStats }}</span>
        </div>

        <div class="generator-editor-shell">
          <pre ref="inputHighlightRef" class="generator-editor-highlight" aria-hidden="true"><code v-html="highlightedInput"></code></pre>
          <textarea
            id="json-schema-input"
            v-model="schemaInput"
            class="generator-editor"
            spellcheck="false"
            wrap="off"
            aria-label="Schema input"
            placeholder="Paste JSON Schema here"
            @scroll="syncInputHighlight"
          ></textarea>
        </div>
      </section>

      <section class="generator-card generator-workspace-card generator-fields-card">
        <div class="generator-card-header">
          <div>
            <p class="generator-card-kicker">Fields</p>
          </div>
          <span class="generator-meta">{{ parsedFieldList.length }} fields</span>
        </div>

        <div v-if="generatedOutput.error" class="generator-error generator-fields-empty">
          <strong>Invalid schema</strong>
          <p>Fix the JSON input to preview parsed fields.</p>
        </div>

        <div v-else-if="parsedFieldList.length === 0" class="generator-fields-empty">
          <strong>No fields found</strong>
          <p>Add object properties to the schema to inspect field-level generation options.</p>
        </div>

        <div v-else class="generator-fields-list">
          <article v-for="field in parsedFieldList" :key="field.name" class="generator-field-card">
            <div class="generator-field-card-header">
            <strong>{{ field.path }}</strong>
              <span v-if="field.required" class="generator-required-badge">required</span>
            </div>

            <p class="generator-field-card-type">{{ field.schemaType }} → {{ field.javaType }}</p>

            <label class="generator-field-card-control">
              <span>Member</span>
              <select :value="field.memberKind" @change="handleFieldMemberKindChange(field.path, $event)">
                <option value="field">Field</option>
                <option value="property">Property</option>
              </select>
            </label>

            <label class="generator-field-card-toggle">
              <input :checked="field.generateAccessors" type="checkbox" @change="handleFieldAccessorChange(field.path, $event)" />
              <span>Generate getter/setter</span>
            </label>
          </article>
        </div>
      </section>

      <section class="generator-card generator-workspace-card">
        <div class="generator-card-header">
          <div>
            <p class="generator-card-kicker">Java Output</p>
          </div>
          <span class="generator-meta">{{ outputHeaderMeta }}</span>
        </div>

        <div class="generator-output-surface">
          <div class="generator-output-actions-floating">
            <button
              type="button"
              class="generator-icon-button"
              :aria-label="copyButtonLabel"
              :title="copyButtonLabel"
              @click="copyOutput"
            >
              {{ copyButtonLabel === 'Copied' ? '✓' : '⧉' }}
            </button>
            <button
              type="button"
              class="generator-icon-button"
              aria-label="Download Java file"
              title="Download Java file"
              @click="downloadOutput"
            >
              ↓
            </button>
          </div>

          <div v-if="generatedOutput.error" class="generator-error">
            <strong>Invalid schema</strong>
            <p>{{ generatedOutput.error }}</p>
          </div>
          <pre v-else id="java-output" class="generator-preview"><code v-html="highlightedOutput"></code></pre>
        </div>
      </section>
    </div>

    <div class="generator-footer">
      <span v-if="toastMessage" class="generator-toast">{{ toastMessage }}</span>
    </div>
  </section>
</template>

<style scoped>
.generator-shell {
  display: grid;
  gap: 14px;
  padding-top: 14px;
  width: 100%;
  max-width: var(--vp-layout-max-width);
  margin: 0 auto;
}

.generator-simple-header h1 {
  margin: 0;
  font-size: 1.5rem;
  line-height: 1.15;
}

.generator-card {
  border: 1px solid var(--vp-c-divider);
  background: color-mix(in srgb, var(--vp-c-bg-soft) 88%, transparent);
  box-shadow: 0 20px 60px -48px rgba(15, 23, 42, 0.55);
}

.generator-kicker,
.generator-card-kicker {
  margin: 0 0 8px;
  font-size: 0.77rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--vp-c-brand-1);
}

.generator-card h2 {
  margin: 0;
  line-height: 1.08;
  font-size: 1.15rem;
  border-top: 0;
  padding-top: 0;
}

.generator-hero-actions,
.generator-output-actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px;
}

.generator-workspace {
  display: grid;
  grid-template-columns: minmax(0, 1.18fr) minmax(220px, 260px) minmax(0, 1.18fr);
  gap: 10px;
}

.generator-controls {
  position: relative;
  gap: 12px;
  padding: 14px 16px;
  border-radius: 18px;
}

.generator-reset-floating {
  position: absolute;
  top: 12px;
  right: 16px;
  z-index: 1;
}

.generator-controls-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 10px;
}

.generator-toggle-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(190px, 1fr));
  gap: 8px;
}

.generator-card {
  display: flex;
  flex-direction: column;
  justify-content: flex-start;
  gap: 18px;
  padding: 18px 16px;
  border-radius: 22px;
}

.generator-workspace-card {
  gap: 8px;
  height: 760px;
  padding-left: 14px;
  padding-right: 14px;
}

.generator-fields-card {
  min-width: 0;
}

.generator-card-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
}

.generator-field {
  display: grid;
  gap: 8px;
}

.generator-fields-list {
  display: grid;
  gap: 10px;
  overflow: auto;
  padding-right: 2px;
}

.generator-field-card {
  display: grid;
  gap: 10px;
  padding: 12px;
  border: 1px solid var(--vp-c-divider);
  border-radius: 14px;
  background: color-mix(in srgb, var(--vp-c-bg) 92%, transparent);
}

.generator-field-card-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.generator-field-card-header strong {
  min-width: 0;
  font-size: 0.92rem;
  line-height: 1.35;
  word-break: break-word;
}

.generator-required-badge {
  flex: none;
  padding: 2px 8px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--vp-c-brand-1) 12%, var(--vp-c-bg-soft));
  color: var(--vp-c-brand-1);
  font-size: 0.72rem;
  font-weight: 700;
}

.generator-field-card-type,
.generator-fields-empty p {
  margin: 0;
  color: var(--vp-c-text-2);
  font-size: 0.82rem;
  line-height: 1.45;
  word-break: break-word;
}

.generator-field-card-control {
  display: grid;
  gap: 6px;
}

.generator-field-card-control span {
  font-size: 0.76rem;
  font-weight: 600;
  color: var(--vp-c-text-2);
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.generator-field-card-control select {
  min-height: 38px;
  padding: 0 12px;
  border: 1px solid color-mix(in srgb, var(--vp-c-divider) 90%, transparent);
  border-radius: 12px;
  background: color-mix(in srgb, var(--vp-c-bg) 96%, transparent);
  color: var(--vp-c-text-1);
  font: inherit;
}

.generator-field-card-toggle {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 0.84rem;
  color: var(--vp-c-text-2);
}

.generator-fields-empty {
  display: grid;
  place-items: center;
  text-align: center;
}

.generator-field span {
  font-size: 0.88rem;
  font-weight: 600;
}

.generator-field input,
.generator-field select,
.generator-editor,
.generator-button,
.generator-text-button {
  font: inherit;
}

.generator-field input,
.generator-field select,
.generator-editor-shell {
  width: 100%;
  border: 1px solid color-mix(in srgb, var(--vp-c-divider) 90%, transparent);
  border-radius: 14px;
  background: color-mix(in srgb, var(--vp-c-bg) 92%, transparent);
  color: var(--vp-c-text-1);
  transition: border-color 0.2s ease, box-shadow 0.2s ease;
}

.generator-field input,
.generator-field select {
  min-height: 44px;
  padding: 0 14px;
}

.generator-field input:focus,
.generator-field select:focus,
.generator-editor:focus,
.generator-editor-shell:focus-within {
  outline: none;
  border-color: color-mix(in srgb, var(--vp-c-brand-1) 68%, white 0%);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--vp-c-brand-1) 16%, transparent);
}

.generator-toggle {
  display: grid;
  grid-template-columns: auto 1fr;
  gap: 10px;
  align-items: start;
  padding: 10px 12px;
  border: 1px solid var(--vp-c-divider);
  border-radius: 12px;
  background: color-mix(in srgb, var(--vp-c-bg) 90%, transparent);
}

.generator-toggle input {
  margin-top: 3px;
}

.generator-toggle strong {
  display: block;
}

.generator-toggle small {
  display: block;
  margin-top: 2px;
  line-height: 1.35;
  color: var(--vp-c-text-2);
}

.generator-editor-shell {
  position: relative;
  flex: 1 1 auto;
  min-height: 0;
  overflow: hidden;
}

.generator-editor,
.generator-editor-highlight,
.generator-preview {
  flex: 1 1 auto;
  min-height: 0;
  margin: 0;
  padding: 18px;
  border-radius: 18px;
  color: #dbe7ff;
  font-family: var(--vp-font-family-mono);
  font-size: 0.9rem;
  line-height: 1.65;
}

.generator-editor,
.generator-editor-highlight,
.generator-preview {
  background: color-mix(in srgb, #0b1120 92%, var(--vp-c-bg) 8%);
}

.generator-editor {
  position: absolute;
  inset: 0;
  border: 0;
  background: transparent;
  color: transparent;
  caret-color: #dbe7ff;
  resize: none;
  overflow: auto;
}

.generator-editor::placeholder {
  color: #8ba0c7;
}

.generator-editor-highlight {
  position: absolute;
  inset: 0;
  overflow: hidden;
  pointer-events: none;
  white-space: pre;
}

.generator-editor-highlight code,
.generator-preview code {
  display: block;
  min-height: 100%;
}

.generator-preview {
  overflow: auto;
}

.generator-output-surface {
  position: relative;
  flex: 1 1 auto;
  min-height: 0;
}

.generator-output-surface .generator-error,
.generator-output-surface .generator-preview {
  height: 100%;
}

.generator-output-actions-floating {
  position: absolute;
  top: 12px;
  right: 12px;
  z-index: 1;
  display: flex;
  gap: 8px;
  opacity: 0;
  pointer-events: none;
  transition: opacity 0.16s ease;
}

.generator-output-surface:hover .generator-output-actions-floating,
.generator-output-surface:focus-within .generator-output-actions-floating {
  opacity: 1;
  pointer-events: auto;
}

.generator-icon-button {
  width: 40px;
  height: 40px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 1px solid color-mix(in srgb, var(--vp-c-divider) 88%, transparent);
  border-radius: 10px;
  background: color-mix(in srgb, #0b1120 82%, var(--vp-c-bg) 18%);
  color: #dbe7ff;
  font: inherit;
  font-size: 1.15rem;
  cursor: pointer;
  transition: transform 0.16s ease, border-color 0.16s ease, background 0.16s ease;
}

.generator-icon-button:hover {
  transform: translateY(-1px);
  border-color: color-mix(in srgb, var(--vp-c-brand-1) 48%, transparent);
}

.generator-editor-highlight :deep(.token-json-key) {
  color: #82aaff;
}

.generator-editor-highlight :deep(.token-json-number) {
  color: #f78c6c;
}

.generator-editor-highlight :deep(.token-json-boolean) {
  color: #c792ea;
}

.generator-editor-highlight :deep(.token-json-null) {
  color: #ff5370;
}

.generator-preview :deep(.token-keyword) {
  color: #c792ea;
}

.generator-preview :deep(.token-annotation) {
  color: #82aaff;
}

.generator-preview :deep(.token-class) {
  color: #ffcb6b;
}

.generator-preview :deep(.token-comment) {
  color: #7f8c98;
}

.generator-preview :deep(.token-string) {
  color: #c3e88d;
}

.generator-meta {
  white-space: nowrap;
  font-size: 0.82rem;
  color: var(--vp-c-text-3);
}

.generator-button,
.generator-text-button {
  border-radius: 999px;
  cursor: pointer;
  transition: transform 0.16s ease, border-color 0.16s ease, background 0.16s ease;
}

.generator-button {
  min-height: 42px;
  padding: 0 16px;
  border: 1px solid var(--vp-c-divider);
  background: color-mix(in srgb, var(--vp-c-bg) 88%, transparent);
  color: var(--vp-c-text-1);
}

.generator-button-brand {
  border-color: color-mix(in srgb, var(--vp-c-brand-1) 52%, transparent);
  background: linear-gradient(180deg, color-mix(in srgb, var(--vp-c-brand-1) 92%, white 8%), var(--vp-c-brand-1));
  color: var(--vp-c-white);
}

.generator-output-actions .generator-button-brand {
  min-height: 32px;
  padding: 0 10px;
  font-size: 0.84rem;
}

.generator-text-button {
  padding: 0;
  border: 0;
  background: transparent;
  color: var(--vp-c-brand-1);
}

.generator-button:hover,
.generator-text-button:hover {
  transform: translateY(-1px);
}

.generator-button:disabled,
.generator-text-button:disabled,
.generator-toggle input:disabled {
  cursor: not-allowed;
  opacity: 0.6;
}

.generator-error {
  padding: 18px;
  border: 1px solid color-mix(in srgb, #ef4444 42%, transparent);
  border-radius: 18px;
  background: color-mix(in srgb, #ef4444 10%, var(--vp-c-bg-soft));
}

.generator-error p {
  margin: 8px 0 0;
  color: var(--vp-c-text-2);
}

.generator-footer {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.generator-toast {
  padding: 8px 12px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--vp-c-brand-1) 14%, var(--vp-c-bg-soft));
  color: var(--vp-c-brand-1);
  font-size: 0.86rem;
  font-weight: 600;
}

@media (max-width: 1180px) {
  .generator-workspace {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .generator-fields-card {
    grid-column: 1 / -1;
    height: auto;
    min-height: 280px;
  }
}

@media (max-width: 768px) {
  .generator-shell {
    gap: 16px;
    padding-top: 14px;
  }

  .generator-workspace {
    grid-template-columns: 1fr;
  }

  .generator-card {
    padding: 16px 14px;
    border-radius: 18px;
  }

  .generator-workspace-card {
    height: 460px;
    padding-left: 12px;
    padding-right: 12px;
  }

  .generator-fields-card {
    height: auto;
    min-height: 260px;
  }

  .generator-controls {
    padding: 12px 14px;
  }

  .generator-reset-floating {
    top: 10px;
    right: 14px;
  }

  .generator-card-header,
  .generator-footer {
    align-items: flex-start;
    flex-direction: column;
  }

  .generator-editor,
  .generator-preview {
    min-height: 0;
  }

}
</style>
