export function toPascalCase(value: string): string {
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

export function toCamelCase(value: string): string {
  const pascal = toPascalCase(value)
  return pascal.charAt(0).toLowerCase() + pascal.slice(1)
}
