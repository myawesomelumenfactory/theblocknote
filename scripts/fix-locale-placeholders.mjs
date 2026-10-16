/**
 * Restore {placeholders} in generated locale files from the English source,
 * and drop duplicate mangled placeholders left by machine translation.
 */
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const localesDir = path.join(root, 'src/i18n/locales')
const en = JSON.parse(fs.readFileSync(path.join(localesDir, 'en.json'), 'utf8'))

function walk(enNode, node, pathKeys = []) {
  if (typeof enNode === 'string') {
    if (typeof node !== 'string') return enNode
    const placeholders = enNode.match(/\{[^}]+\}/g) || []
    if (placeholders.length === 0) return node
    let out = node
    // Drop common machine-translated placeholder ghosts: {idioma}, {proveedor}, etc.
    out = out.replace(/\{[^{}]+\}/g, (match) => (placeholders.includes(match) ? match : ''))
    out = out.replace(/\s{2,}/g, ' ').trim()
    for (const ph of placeholders) {
      if (!out.includes(ph)) {
        // Put missing placeholders back at the end of the string.
        out = `${out} ${ph}`.trim()
      }
    }
    // Prefer English if translation emptied the useful text.
    if (!out.replace(/\{[^}]+\}/g, '').trim() && enNode.replace(/\{[^}]+\}/g, '').trim()) {
      return enNode
    }
    return out
  }
  if (Array.isArray(enNode)) {
    if (!Array.isArray(node)) return enNode
    return enNode.map((item, i) => walk(item, node[i], pathKeys.concat(i)))
  }
  if (enNode && typeof enNode === 'object') {
    const out = { ...(node && typeof node === 'object' ? node : {}) }
    for (const key of Object.keys(enNode)) {
      out[key] = walk(enNode[key], out[key], pathKeys.concat(key))
    }
    return out
  }
  return node
}

for (const file of fs.readdirSync(localesDir).filter((f) => f.endsWith('.json') && f !== 'en.json')) {
  const filePath = path.join(localesDir, file)
  const data = JSON.parse(fs.readFileSync(filePath, 'utf8'))
  const fixed = walk(en, data)
  fs.writeFileSync(filePath, JSON.stringify(fixed, null, 2) + '\n')
  console.log('fixed', file)
}
