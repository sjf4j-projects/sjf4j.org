import {
  collectSchemaFields,
  getDefaultAccessors,
  getDefaultTypeOption,
  getTypeOptions,
  toJsonPath,
} from './mapping'
import { getParentPath, getSchemaNodeAtPath, resolveMemberKind } from './memberKind'
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
  return collectSchemaFields(schema, options.useBigDecimal)
    .filter((field) => field.path !== '')
    .map((field) => {
      const defaultJavaType = getDefaultTypeOption(field.node, field.path, options)
      const override = fieldOverrides[field.path] || {}
      const defaultPathAccessors = getDefaultAccessors(field.required, options)
      const resolvedJavaType = override.javaType || defaultJavaType
      const ownerSchema = getSchemaNodeAtPath(schema, getParentPath(field.path)) || schema
      const memberKind = resolveMemberKind(field.required, ownerSchema, options, override)

      return {
        path: field.path,
        displayPath: toJsonPath(field.path),
        javaType: resolvedJavaType,
        schemaType: field.schemaType,
        required: field.required,
        memberKind: memberKind.memberKind,
        propertyAllowed: memberKind.propertyAllowed,
        pathAccessors: override.pathAccessors || defaultPathAccessors,
        typeOptions: Array.from(new Set([resolvedJavaType, ...getTypeOptions(field.node, field.path, options)])),
      }
    })
}
