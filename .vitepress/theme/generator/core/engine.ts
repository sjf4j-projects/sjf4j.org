import {
  collectSchemaFields,
  getDefaultAccessors,
  getDefaultTypeOption,
  getTypeOptions,
  toJsonPath,
} from './mapping'
import { getEffectiveObjectMode, getParentPath, getSchemaNodeAtPath, resolveMemberKind } from './memberKind'
import { renderJava } from './renderJava'
import type {
  FieldOverride,
  GeneratedOutput,
  GeneratorOptions,
  ParseSchemaResult,
  ParsedFieldDescriptor,
  SchemaNode,
} from './types'

export function generateJavaOutput(
  parsedSchema: ParseSchemaResult,
  options: GeneratorOptions,
  fieldOverrides: Record<string, FieldOverride> = {},
): GeneratedOutput {
  if (!parsedSchema.ok) {
    return {
      code: '',
      error: parsedSchema.error,
    }
  }

  return {
    code: renderJava(parsedSchema.schema, options, fieldOverrides),
    error: '',
  }
}

export function buildParsedFieldList(
  schema: SchemaNode,
  options: GeneratorOptions,
  fieldOverrides: Record<string, FieldOverride> = {},
): ParsedFieldDescriptor[] {
  function isMemberConfigAllowed(path: string): boolean {
    const segments = path.split('/').filter(Boolean)

    for (let length = segments.length - 1; length > 0; length -= 1) {
      const ancestorPath = `/${segments.slice(0, length).join('/')}`
      const ancestorSchema = getSchemaNodeAtPath(schema, ancestorPath)
      if (!ancestorSchema?.properties) {
        continue
      }

      if (getEffectiveObjectMode(ancestorSchema, options, fieldOverrides[ancestorPath]?.javaType) === 'jsonObject') {
        return false
      }
    }

    return true
  }

  return collectSchemaFields(schema, options.useBigDecimal)
    .filter((field) => field.path !== '')
    .map((field) => {
      const defaultJavaType = getDefaultTypeOption(field.node, field.path, options)
      const override = fieldOverrides[field.path] || {}
      const defaultPathAccessors = getDefaultAccessors(field.required, options)
      const resolvedJavaType = override.javaType || defaultJavaType
      const ownerSchema = getSchemaNodeAtPath(schema, getParentPath(field.path)) || schema
      const ownerPath = getParentPath(field.path)
      const memberConfigAllowed = isMemberConfigAllowed(field.path)
      const memberKind = resolveMemberKind(
        field.required,
        ownerSchema,
        options,
        override,
        ownerPath ? fieldOverrides[ownerPath]?.javaType : undefined,
      )

      return {
        path: field.path,
        displayPath: toJsonPath(field.path),
        javaType: resolvedJavaType,
        schemaType: field.schemaType,
        required: field.required,
        memberConfigAllowed,
        memberKind: memberConfigAllowed ? memberKind.memberKind : 'field',
        propertyAllowed: memberConfigAllowed ? memberKind.propertyAllowed : false,
        pathAccessors: override.pathAccessors || defaultPathAccessors,
        typeOptions: Array.from(new Set([resolvedJavaType, ...getTypeOptions(field.node, field.path, options)])),
      }
    })
}
