export type ValidationNamespace = 'jakarta' | 'javax'
export type ValidationAnnotation = '@NotNull' | '@Size' | '@Min' | '@Max' | '@Pattern'
export type BooleanMapping = 'boolean' | 'Boolean'
export type DateTimeMapping = 'OffsetDateTime' | 'LocalDateTime' | 'Instant' | 'plainString'
export type EnumMapping = 'javaEnum' | 'plainString'
export type JavaDocGenerationMode = 'description' | 'title' | 'none'
export type AccessorMode = 'lombok' | 'methods' | 'none'
export type IntegerMapping = 'int' | 'Integer' | 'long' | 'Long' | 'BigInteger'
export type ModelingStrategy = 'jojo' | 'pojo' | 'pathOnly'
export type NumberMapping = 'double' | 'Double' | 'BigDecimal' | 'int' | 'long'
export type ObjectLeafMapping = 'jsonObject' | 'mapObject' | 'jojo'
export type PathAccessMode = 'getterSetter' | 'pathGetterSetter'
export type FieldStrategy = 'all' | 'required' | 'none'
export type PathAccessorStrategy = 'all' | 'required' | 'none'
export type PathStrategy = 'compiledPath' | 'jsonPath'
export type FieldMemberKind = 'field' | 'property'

export type FieldOverride = {
  memberKind: FieldMemberKind
  javaType?: string
  pathAccessors?: PathAccessMode[]
}

export type GeneratorOptions = {
  packageName: string
  className: string
  booleanMapping: BooleanMapping
  dateTimeMapping: DateTimeMapping
  enumMapping: EnumMapping
  integerMapping: IntegerMapping
  modelingStrategy: ModelingStrategy
  numberMapping: NumberMapping
  objectLeafMapping: ObjectLeafMapping
  fieldStrategy: FieldStrategy
  accessorMode: AccessorMode
  pathAccessorStrategy: PathAccessorStrategy
  pathStrategy: PathStrategy
  useValidation: boolean
  validationAnnotations: ValidationAnnotation[]
  validationNamespace: ValidationNamespace
  javaDocGeneration: JavaDocGenerationMode
  useBigDecimal: boolean
}

export type SchemaNode = {
  $schema?: string
  $id?: string
  $ref?: string
  $defs?: Record<string, SchemaNode>
  title?: string
  description?: string
  default?: unknown
  enum?: unknown[]
  type?: string | string[]
  format?: string
  minLength?: number
  maxLength?: number
  minItems?: number
  maxItems?: number
  pattern?: string
  minimum?: number
  maximum?: number
  allOf?: SchemaNode[]
  additionalProperties?: boolean | SchemaNode
  properties?: Record<string, SchemaNode>
  items?: SchemaNode
  required?: string[]
}

export type ParseSchemaResult =
  | { ok: true; schema: SchemaNode }
  | { ok: false; error: string }

export type GeneratedOutput = {
  code: string
  error: string
}

export type ParsedSchemaField = {
  path: string
  javaType: string
  schemaType: string
  required: boolean
  node: SchemaNode | undefined
}

export type ParsedFieldDescriptor = {
  path: string
  displayPath: string
  javaType: string
  schemaType: string
  required: boolean
  memberConfigAllowed: boolean
  memberKindConfigAllowed: boolean
  typeConfigAllowed: boolean
  memberKind: FieldMemberKind
  propertyAllowed: boolean
  pathAccessors: PathAccessMode[]
  typeOptions: string[]
}
