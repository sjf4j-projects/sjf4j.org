<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import {
  buildParsedFieldList,
  createDefaultGeneratorOptions,
  generateJavaOutput,
  parseSchemaBundleText,
  resolveClassName,
  shouldRenderAsJojo,
  validationAnnotationOptions,
  type FieldMemberKind,
  type FieldOverride,
  type GeneratorOptions,
  type ValidationAnnotation,
} from '../generator/core'

type SchemaLibraryInput = {
  key: number
  content: string
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
    "customer": {
      "type": "object",
      "required": ["id", "email"],
      "properties": {
        "id": {
          "type": "string"
        },
        "email": {
          "type": "string"
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
          }
        }
      }
    }
  }
}`

const schemaInput = ref(exampleSchema)
const schemaLibraries = ref<SchemaLibraryInput[]>([])
const nextSchemaLibraryKey = ref(1)
const options = ref<GeneratorOptions>(createDefaultGeneratorOptions())
const toastMessage = ref('')
const copyButtonLabel = ref('Copy')
const inputHighlightRef = ref<HTMLElement | null>(null)
const validationAnnotationsRef = ref<HTMLDetailsElement | null>(null)
const fieldOverrides = ref<Record<string, FieldOverride>>({})

function showToast(message: string) {
  toastMessage.value = message
  window.setTimeout(() => {
    if (toastMessage.value === message) {
      toastMessage.value = ''
    }
  }, 2200)
}

function closeValidationAnnotationsMenu() {
  if (validationAnnotationsRef.value?.open) {
    validationAnnotationsRef.value.open = false
  }
}

function handleDocumentClick(event: MouseEvent) {
  const dropdown = validationAnnotationsRef.value
  const target = event.target

  if (!(target instanceof Node)) {
    return
  }

  if (dropdown?.open && !dropdown.contains(target)) {
    closeValidationAnnotationsMenu()
  }
}

function handleDocumentKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') {
    closeValidationAnnotationsMenu()
  }
}

function handleValidationAnnotationsSummaryClick(event: MouseEvent) {
  if (!options.value.useValidation) {
    event.preventDefault()
  }
}

onMounted(() => {
  document.addEventListener('click', handleDocumentClick)
  document.addEventListener('keydown', handleDocumentKeydown)
})

onBeforeUnmount(() => {
  document.removeEventListener('click', handleDocumentClick)
  document.removeEventListener('keydown', handleDocumentKeydown)
})

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

function describeTextStats(value: string): string {
  const lines = value.split('\n').length
  const characters = value.length
  return `${lines} lines · ${characters} chars`
}

function detectSchemaDocumentId(content: string): string | null {
  try {
    const parsed = JSON.parse(content) as { $id?: unknown }
    return typeof parsed.$id === 'string' && parsed.$id.trim() ? parsed.$id.trim() : null
  } catch {
    return null
  }
}

const parsedSchemaState = computed(() => parseSchemaBundleText(
  schemaInput.value,
  schemaLibraries.value.map((library) => library.content),
))

const resolvedClassName = computed(() => resolveClassName(parsedSchemaState.value, options.value))

const generatedOutput = computed(() => generateJavaOutput(parsedSchemaState.value, options.value, fieldOverrides.value))

const schemaStats = computed(() => {
  return describeTextStats(schemaInput.value)
})

const outputStats = computed(() => {
  if (!generatedOutput.value.code) {
    return 'No output yet'
  }
  return describeTextStats(generatedOutput.value.code)
})

const outputHeaderMeta = computed(() => `${resolvedClassName.value}.java · ${outputStats.value}`)

const validationAnnotationsLabel = computed(() => {
  const selected = options.value.validationAnnotations

  if (selected.length === 0) {
    return 'None'
  }

  if (selected.length === validationAnnotationOptions.length) {
    return 'All'
  }

  if (selected.length <= 2) {
    return selected.join(', ')
  }

  return `${selected.length} selected`
})

const parsedFieldList = computed(() => {
  if (!parsedSchemaState.value.ok) {
    return []
  }

  return buildParsedFieldList(parsedSchemaState.value.schema, options.value, fieldOverrides.value)
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

function toggleValidationAnnotation(annotation: ValidationAnnotation) {
  if (!options.value.useValidation) {
    return
  }

  const selected = options.value.validationAnnotations

  options.value.validationAnnotations = selected.includes(annotation)
    ? selected.filter((entry) => entry !== annotation)
    : [...selected, annotation]
}

function updateFieldMemberKind(name: string, memberKind: FieldMemberKind) {
  fieldOverrides.value = {
    ...fieldOverrides.value,
    [name]: {
      ...fieldOverrides.value[name],
      memberKind,
    },
  }
}

function updateFieldType(name: string, javaType: string) {
  fieldOverrides.value = {
    ...fieldOverrides.value,
    [name]: {
      ...fieldOverrides.value[name],
      javaType,
    },
  }
}

function handleFieldMemberKindChange(name: string, event: Event) {
  updateFieldMemberKind(name, (event.target as HTMLSelectElement).value as FieldMemberKind)
}

function handleFieldTypeChange(name: string, event: Event) {
  updateFieldType(name, (event.target as HTMLSelectElement).value)
}

function canTogglePathAccessor(path: string) {
  if (!parsedSchemaState.value.ok) {
    return false
  }

  return shouldRenderAsJojo(parsedSchemaState.value.schema, options.value)
    && path.split('/').filter(Boolean).length > 1
}

function toggleFieldPathAccessor(name: string) {
  const current = fieldOverrides.value[name]?.pathAccessors || []
  const pathAccessors = current.includes('pathGetterSetter')
    ? current.filter((entry) => entry !== 'pathGetterSetter')
    : [...current, 'pathGetterSetter']

  fieldOverrides.value = {
    ...fieldOverrides.value,
    [name]: {
      ...fieldOverrides.value[name],
      pathAccessors,
    },
  }
}

function createEmptySchemaLibrary(): SchemaLibraryInput {
  const key = nextSchemaLibraryKey.value
  nextSchemaLibraryKey.value += 1

  return {
    key,
    content: `{
  "$id": "common.json",
  "$defs": {}
}`,
  }
}

function addSchemaLibrary() {
  schemaLibraries.value = [...schemaLibraries.value, createEmptySchemaLibrary()]
}

function removeSchemaLibrary(key: number) {
  schemaLibraries.value = schemaLibraries.value.filter((library) => library.key !== key)
}

function formatSchemaLibrary(key: number) {
  const target = schemaLibraries.value.find((library) => library.key === key)
  if (!target) {
    return
  }

  try {
    target.content = JSON.stringify(JSON.parse(target.content), null, 2)
  } catch {}
}

function getSchemaLibraryStats(content: string): string {
  return describeTextStats(content)
}

function loadExample() {
  schemaInput.value = exampleSchema
  schemaLibraries.value = []
  showToast('Reloaded sample schema.')
}

function confirmReloadSample(hide: () => void) {
  loadExample()
  hide()
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
  options.value = createDefaultGeneratorOptions()
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
          <input v-model="options.className" type="text" placeholder="Leave empty to use title" />
        </label>

        <label class="generator-field">
          <span>Modeling strategy</span>
          <select v-model="options.modelingStrategy">
            <option value="jojo">JOJO preferred</option>
            <option value="pojo">POJO preferred</option>
            <option value="pathOnly">Path only (JsonObject preferred)</option>
          </select>
        </label>

        <label class="generator-field">
          <span>Field generation</span>
          <select v-model="options.fieldStrategy">
            <option value="all">All</option>
            <option value="required">Required Only</option>
            <option value="none">None</option>
          </select>
        </label>

        <label class="generator-field">
          <span>Accessor strategy</span>
          <select v-model="options.accessorMode">
            <option value="lombok">Lombok annotations</option>
            <option value="methods">Generate getters and setters</option>
            <option value="none">Public fields</option>
          </select>
        </label>

        <label class="generator-field">
          <span>Path accessor</span>
          <select v-model="options.pathAccessorStrategy">
            <option value="all">All</option>
            <option value="required">Required Only</option>
            <option value="none">None</option>
          </select>
        </label>

        <label class="generator-field">
          <span>Path strategy</span>
          <select v-model="options.pathStrategy">
            <option value="compiledPath">@CompiledPath</option>
            <option value="jsonPath">JsonPath</option>
          </select>
        </label>

        <label class="generator-field">
          <span>Object leaf mapping</span>
          <select v-model="options.objectLeafMapping">
            <option value="jsonObject">JsonObject</option>
            <option value="mapObject">Map&lt;String, Object&gt;</option>
            <option value="jojo">JOJO</option>
          </select>
        </label>

        <label class="generator-field">
          <span>Number mapping</span>
          <select v-model="options.numberMapping">
            <option value="double">double</option>
            <option value="Double">Double</option>
            <option value="BigDecimal">BigDecimal</option>
            <option value="int">int</option>
            <option value="long">long</option>
          </select>
        </label>

        <label class="generator-field">
          <span>Integer mapping</span>
          <select v-model="options.integerMapping">
            <option value="int">int</option>
            <option value="Integer">Integer</option>
            <option value="long">long</option>
            <option value="Long">Long</option>
            <option value="BigInteger">BigInteger</option>
          </select>
        </label>

        <label class="generator-field">
          <span>Boolean mapping</span>
          <select v-model="options.booleanMapping">
            <option value="boolean">boolean</option>
            <option value="Boolean">Boolean</option>
          </select>
        </label>

        <label class="generator-field">
          <span>Enum mapping</span>
          <select v-model="options.enumMapping">
            <option value="javaEnum">Java enum</option>
            <option value="plainString">Plain string</option>
          </select>
        </label>

        <label class="generator-field">
          <span>DateTime mapping</span>
          <select v-model="options.dateTimeMapping">
            <option value="OffsetDateTime">OffsetDateTime</option>
            <option value="LocalDateTime">LocalDateTime</option>
            <option value="Instant">Instant</option>
            <option value="plainString">Plain string</option>
          </select>
        </label>

        <div class="generator-field">
          <span>Validation annotations</span>
          <details ref="validationAnnotationsRef" class="generator-multiselect" :class="{ 'is-disabled': !options.useValidation }">
            <summary @click="handleValidationAnnotationsSummaryClick">
              <span>{{ validationAnnotationsLabel }}</span>
            </summary>

            <div class="generator-multiselect-menu">
              <button
                v-for="annotation in validationAnnotationOptions"
                :key="annotation"
                type="button"
                class="generator-multiselect-option"
                :disabled="!options.useValidation"
                @click="toggleValidationAnnotation(annotation)"
              >
                <span class="generator-multiselect-option-label">{{ annotation }}</span>
                <span
                  class="generator-multiselect-option-check"
                  :class="{ 'is-selected': options.validationAnnotations.includes(annotation) }"
                >
                  ✓
                </span>
              </button>
            </div>
          </details>
        </div>

        <label class="generator-field">
          <span>Validation namespace</span>
          <select v-model="options.validationNamespace" :disabled="!options.useValidation">
            <option value="jakarta">jakarta.validation</option>
            <option value="javax">javax.validation</option>
          </select>
        </label>

        <label class="generator-field">
          <span>JavaDoc generation</span>
          <select v-model="options.javaDocGeneration">
            <option value="description">Description only</option>
            <option value="title">Title only</option>
            <option value="none">None</option>
          </select>
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
          <div class="generator-editor-actions-floating">
            <VDropdown placement="bottom-end" :distance="8" :triggers="['click']" :auto-hide="true">
              <button
                type="button"
                class="generator-icon-button"
                aria-label="Reload sample"
                title="Reload sample"
              >
                ↺
              </button>

              <template #popper="{ hide }">
                <div class="generator-popconfirm">
                  <p>Reload sample?</p>
                  <div class="generator-popconfirm-actions">
                    <button type="button" class="generator-popconfirm-button" @click="hide()">Cancel</button>
                    <button type="button" class="generator-popconfirm-button is-primary" @click="confirmReloadSample(hide)">Reload</button>
                  </div>
                </div>
              </template>
            </VDropdown>
          </div>
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

        <section class="generator-schema-libraries">
          <div class="generator-subsection-header">
            <div>
              <p class="generator-card-kicker">Schema Libraries</p>
              <p class="generator-subsection-copy">Add extra schema documents below the main schema.</p>
            </div>

            <button type="button" class="generator-button generator-library-add-button" @click="addSchemaLibrary">
              + Add library
            </button>
          </div>

          <div v-if="schemaLibraries.length === 0" class="generator-libraries-empty">
            <strong>No schema libraries yet</strong>
            <p>Add a supporting schema such as <code>common.json</code>.</p>
          </div>

          <div v-else class="generator-library-list">
            <article v-for="(library, index) in schemaLibraries" :key="library.key" class="generator-library-card">
              <div class="generator-library-card-header">
                <div class="generator-library-card-title">
                  <strong>Library {{ index + 1 }}</strong>
                  <span class="generator-meta">{{ getSchemaLibraryStats(library.content) }}</span>
                  <span v-if="detectSchemaDocumentId(library.content)" class="generator-library-id-pill">
                    $id: {{ detectSchemaDocumentId(library.content) }}
                  </span>
                </div>

                <div class="generator-library-card-actions">
                  <button type="button" class="generator-text-button generator-library-action-button" @click="formatSchemaLibrary(library.key)">Format</button>
                  <button type="button" class="generator-text-button generator-library-action-button" @click="removeSchemaLibrary(library.key)">Remove</button>
                </div>
              </div>

              <textarea
                v-model="library.content"
                class="generator-library-editor"
                spellcheck="false"
                wrap="off"
                :aria-label="`Schema library ${index + 1}`"
                placeholder="Paste supporting JSON Schema here"
              ></textarea>

              <p class="generator-library-hint">
                Put document identity in schema content, for example <code>"$id": "common.json"</code>.
              </p>
            </article>
          </div>
        </section>
      </section>

      <section class="generator-card generator-workspace-card generator-fields-card">
        <div class="generator-card-header">
          <div>
            <p class="generator-card-kicker">Parsed Properties</p>
          </div>
          <span class="generator-meta">{{ parsedFieldList.length }} properties</span>
        </div>

        <div v-if="generatedOutput.error" class="generator-error generator-fields-empty">
          <strong>Invalid schema</strong>
          <p>Fix the JSON input to preview parsed properties.</p>
        </div>

        <div v-else-if="parsedFieldList.length === 0" class="generator-fields-empty">
          <strong>No properties found</strong>
          <p>Add object properties to the schema to inspect property-level generation options.</p>
        </div>

        <div v-else class="generator-fields-list">
          <article v-for="field in parsedFieldList" :key="field.path" class="generator-field-card">
            <div class="generator-field-card-header">
            <strong>{{ field.displayPath }}</strong>
              <span v-if="field.required" class="generator-required-badge">required</span>
            </div>

            <p class="generator-field-card-type">{{ field.schemaType }}</p>

            <div v-if="field.memberKindConfigAllowed || field.typeConfigAllowed" class="generator-field-card-row">
              <label v-if="field.memberKindConfigAllowed" class="generator-field-card-control">
                <select :value="field.memberKind" @change="handleFieldMemberKindChange(field.path, $event)">
                  <option value="field">Field</option>
                  <option value="property" :disabled="!field.propertyAllowed">Property</option>
                </select>
              </label>

              <label v-if="field.typeConfigAllowed" class="generator-field-card-control">
                <select :value="field.javaType" @change="handleFieldTypeChange(field.path, $event)">
                  <option v-for="typeOption in field.typeOptions" :key="typeOption" :value="typeOption">{{ typeOption }}</option>
                </select>
              </label>
            </div>

            <div v-if="canTogglePathAccessor(field.path)" class="generator-field-card-control">
              <div class="generator-field-card-chip-group">
                <button
                  type="button"
                  class="generator-field-card-chip"
                  :class="{ 'is-selected': field.pathAccessors.includes('pathGetterSetter') }"
                  @click="toggleFieldPathAccessor(field.path)"
                >
                  By-path getter/setter
                </button>
              </div>
            </div>
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
  max-width: none;
  margin: 0;
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
  grid-template-columns: minmax(0, 1fr) minmax(240px, 295px) minmax(0, 1fr);
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

.generator-schema-libraries {
  display: grid;
  gap: 12px;
  min-height: 0;
  padding-top: 12px;
  border-top: 1px solid color-mix(in srgb, var(--vp-c-divider) 88%, transparent);
}

.generator-subsection-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}

.generator-subsection-copy,
.generator-library-hint,
.generator-libraries-empty p {
  margin: 0;
  color: var(--vp-c-text-2);
  font-size: 0.82rem;
  line-height: 1.5;
}

.generator-library-add-button {
  flex: none;
}

.generator-libraries-empty {
  display: grid;
  gap: 4px;
  padding: 14px;
  border: 1px dashed color-mix(in srgb, var(--vp-c-divider) 90%, transparent);
  border-radius: 14px;
  background: color-mix(in srgb, var(--vp-c-bg) 90%, transparent);
}

.generator-library-list {
  display: grid;
  gap: 10px;
  max-height: 300px;
  min-height: 0;
  overflow: auto;
  padding-right: 2px;
}

.generator-library-card {
  display: grid;
  gap: 10px;
  padding: 12px;
  border: 1px solid var(--vp-c-divider);
  border-radius: 16px;
  background: color-mix(in srgb, var(--vp-c-bg) 94%, transparent);
}

.generator-library-card-header,
.generator-library-card-title,
.generator-library-card-actions {
  display: flex;
}

.generator-library-card-header {
  align-items: flex-start;
  justify-content: space-between;
  gap: 10px;
}

.generator-library-card-title {
  flex-direction: column;
  gap: 2px;
}

.generator-library-card-title strong {
  font-size: 0.92rem;
}

.generator-library-id-pill {
  align-self: flex-start;
  padding: 0.14rem 0.5rem;
  border-radius: 999px;
  background: color-mix(in srgb, var(--vp-c-brand-1) 10%, var(--vp-c-bg));
  color: var(--vp-c-brand-1);
  font-size: 0.74rem;
  font-weight: 600;
  line-height: 1.3;
  word-break: break-all;
}

.generator-library-card-actions {
  flex-wrap: wrap;
  gap: 10px;
}

.generator-library-editor {
  width: 100%;
  min-height: 160px;
  padding: 12px 14px;
  border: 1px solid color-mix(in srgb, var(--vp-c-divider) 90%, transparent);
  border-radius: 14px;
  background: color-mix(in srgb, #0b1120 92%, var(--vp-c-bg) 8%);
  color: #dbe7ff;
  font: inherit;
  font-family: var(--vp-font-family-mono);
  font-size: 0.84rem;
  line-height: 1.6;
  resize: vertical;
}

.generator-library-editor:focus {
  outline: none;
  border-color: color-mix(in srgb, var(--vp-c-brand-1) 68%, white 0%);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--vp-c-brand-1) 16%, transparent);
}

.generator-subsection-copy code,
.generator-library-hint code,
.generator-libraries-empty code {
  padding: 0.08rem 0.38rem;
  border-radius: 999px;
  background: color-mix(in srgb, var(--vp-c-brand-1) 10%, var(--vp-c-bg));
  color: var(--vp-c-brand-1);
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
  padding: 0;
  border-radius: 0;
  background: transparent;
  color: var(--vp-c-brand-1);
  font-size: 0.72rem;
  font-weight: 700;
  letter-spacing: 0.03em;
  text-transform: uppercase;
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
  min-width: 0;
}

.generator-field-card-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  gap: 8px;
}

.generator-field-card-control span {
  font-size: 0.76rem;
  font-weight: 600;
  color: var(--vp-c-text-2);
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.generator-field-card-control select {
  width: 100%;
  min-height: 38px;
  padding: 0 12px;
  border: 1px solid color-mix(in srgb, var(--vp-c-divider) 90%, transparent);
  border-radius: 12px;
  background: color-mix(in srgb, var(--vp-c-bg) 96%, transparent);
  color: var(--vp-c-text-1);
  font: inherit;
}

.generator-field-card-row .generator-field-card-control select {
  min-height: 34px;
  padding: 0 10px;
  font-size: 0.84rem;
}

.generator-field-card-chip-group {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.generator-field-card-chip {
  min-height: 32px;
  padding: 0 12px;
  border: 1px solid color-mix(in srgb, var(--vp-c-divider) 90%, transparent);
  border-radius: 999px;
  background: color-mix(in srgb, var(--vp-c-bg) 96%, transparent);
  color: var(--vp-c-text-2);
  font: inherit;
  font-size: 0.82rem;
  cursor: pointer;
  transition: border-color 0.16s ease, background 0.16s ease, color 0.16s ease;
}

.generator-field-card-chip.is-selected {
  border-color: color-mix(in srgb, var(--vp-c-brand-1) 40%, transparent);
  background: color-mix(in srgb, var(--vp-c-brand-1) 12%, var(--vp-c-bg));
  color: var(--vp-c-brand-1);
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

.generator-controls .generator-field span {
  font-size: 0.84rem;
}

.generator-multiselect {
  position: relative;
  width: 100%;
  height: 44px;
  box-sizing: border-box;
  border: 1px solid color-mix(in srgb, var(--vp-c-divider) 90%, transparent);
  border-radius: 14px;
  background: color-mix(in srgb, var(--vp-c-bg) 92%, transparent);
  color: var(--vp-c-text-1);
  transition: border-color 0.2s ease, box-shadow 0.2s ease;
}

.generator-controls .generator-multiselect {
  height: 40px;
}

.generator-multiselect.is-disabled {
  opacity: 0.65;
}

.generator-multiselect[open] {
  border-color: color-mix(in srgb, var(--vp-c-brand-1) 68%, white 0%);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--vp-c-brand-1) 12%, transparent);
}

.generator-multiselect summary {
  position: relative;
  height: 100%;
  margin: 0;
  padding: 0 34px 0 14px;
  display: flex;
  align-items: center;
  width: 100%;
  cursor: pointer;
  list-style: none;
  box-sizing: border-box;
  user-select: none;
}

.generator-controls .generator-multiselect summary {
  padding: 0 32px 0 12px;
}

.generator-multiselect summary::-webkit-details-marker {
  display: none;
}

.generator-multiselect summary:focus {
  outline: none;
}

.generator-multiselect summary::after {
  content: '';
  position: absolute;
  top: 50%;
  right: 14px;
  width: 5px;
  height: 5px;
  border-right: 1.25px solid var(--vp-c-text-2);
  border-bottom: 1.25px solid var(--vp-c-text-2);
  transform: translateY(-65%) rotate(45deg);
  transition: transform 0.16s ease;
}

.generator-multiselect[open] summary::after {
  transform: translateY(-35%) rotate(225deg);
}

.generator-multiselect summary span {
  display: block;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 0.88rem;
  font-weight: 400;
  line-height: 1.2;
}

.generator-controls .generator-multiselect summary span {
  font-size: 0.84rem;
}

.generator-multiselect-menu {
  position: absolute;
  top: calc(100% + 4px);
  left: 0;
  right: 0;
  z-index: 10;
  display: grid;
  gap: 2px;
  max-height: 220px;
  overflow: auto;
  padding: 6px;
  border: 1px solid color-mix(in srgb, var(--vp-c-divider) 90%, transparent);
  border-radius: 12px;
  background: var(--vp-c-bg);
  box-shadow: 0 10px 24px -18px rgba(15, 23, 42, 0.45);
}

.generator-multiselect-option {
  display: flex;
  align-items: center;
  justify-content: space-between;
  min-height: 34px;
  width: 100%;
  padding: 0 8px;
  border: 0;
  border-radius: 8px;
  background: transparent;
  color: var(--vp-c-text-1);
  cursor: pointer;
  font: inherit;
  text-align: left;
}

.generator-multiselect-option:hover {
  background: color-mix(in srgb, var(--vp-c-text-1) 4%, transparent);
}

.generator-multiselect-option:disabled {
  cursor: default;
}

.generator-multiselect-option-label {
  font-size: 0.86rem;
  font-weight: 500;
}

.generator-multiselect-option-check {
  flex: none;
  width: 12px;
  color: var(--vp-c-brand-1);
  opacity: 0;
  font-size: 0.72rem;
  text-align: center;
}

.generator-multiselect-option-check.is-selected {
  opacity: 1;
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

.generator-controls .generator-field input,
.generator-controls .generator-field select {
  min-height: 40px;
  padding: 0 12px;
  font-size: 0.84rem;
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

.generator-editor-actions-floating,
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

.generator-editor-shell:hover .generator-editor-actions-floating,
.generator-editor-shell:focus-within .generator-editor-actions-floating,
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

.generator-popconfirm {
  min-width: 168px;
  padding: 2px;
}

.generator-popconfirm p {
  margin: 0 0 8px;
  color: var(--vp-c-text-1);
  font-size: 0.8rem;
}

.generator-popconfirm-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}

.generator-popconfirm-button {
  min-height: 28px;
  padding: 0 10px;
  border: 1px solid color-mix(in srgb, var(--vp-c-divider) 88%, transparent);
  border-radius: 999px;
  background: color-mix(in srgb, var(--vp-c-bg) 96%, transparent);
  color: var(--vp-c-text-1);
  font: inherit;
  font-size: 0.76rem;
  cursor: pointer;
}

.generator-popconfirm-button.is-primary {
  border-color: color-mix(in srgb, var(--vp-c-brand-1) 48%, transparent);
  background: color-mix(in srgb, var(--vp-c-brand-1) 12%, var(--vp-c-bg));
  color: var(--vp-c-brand-1);
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

.generator-button.generator-library-add-button {
  min-height: 38px;
  padding: 0 14px;
  font-size: 0.84rem;
}

.generator-text-button.generator-library-action-button {
  font-size: 0.84rem;
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
  .generator-subsection-header,
  .generator-footer {
    align-items: flex-start;
    flex-direction: column;
  }

  .generator-library-list {
    max-height: 260px;
  }

  .generator-editor,
  .generator-preview {
    min-height: 0;
  }

}
</style>
