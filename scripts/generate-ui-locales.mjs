/**
 * Translate the English UI catalog into every switcher language.
 * Usage: node scripts/generate-ui-locales.mjs [--only=es,de] [--force]
 */
import fs from 'fs'
import path from 'path'
import { fileURLToPath, pathToFileURL } from 'url'
import vm from 'vm'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(__dirname, '..')
const localesDir = path.join(root, 'src/i18n/locales')

const args = process.argv.slice(2)
const force = args.includes('--force')
const onlyArg = args.find((a) => a.startsWith('--only='))
const only = onlyArg ? onlyArg.slice(7).split(',').filter(Boolean) : null

const SEP = '\n␟\n'

function loadLanguages() {
  const code = fs.readFileSync(path.join(root, 'src/i18n/languages.js'), 'utf8')
  const sandbox = {}
  vm.createContext(sandbox)
  vm.runInContext(code.replace(/^export /gm, '') + '\nthis.LANGUAGES = LANGUAGES;', sandbox)
  return sandbox.LANGUAGES
}

function loadTranslations() {
  let src = fs.readFileSync(path.join(root, 'src/i18n/translations.js'), 'utf8')
  src = src.replace(/^export \{ LOCALES \} from .*$/m, '')
  src = src.replace(/^export const /gm, 'const ')
  src = src.replace(/^export \{.*$/gm, '')
  const sandbox = {}
  vm.createContext(sandbox)
  vm.runInContext(`${src}\nthis.translations = translations;`, sandbox)
  return sandbox.translations
}

function flatten(obj, prefix = '') {
  const out = {}
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix ? `${prefix}.${k}` : k
    if (Array.isArray(v)) out[key] = v
    else if (v && typeof v === 'object') Object.assign(out, flatten(v, key))
    else out[key] = v
  }
  return out
}

function unflatten(flat) {
  const rootObj = {}
  for (const [key, value] of Object.entries(flat)) {
    const parts = key.split('.')
    let node = rootObj
    for (let i = 0; i < parts.length - 1; i++) {
      node[parts[i]] ||= {}
      node = node[parts[i]]
    }
    node[parts[parts.length - 1]] = value
  }
  return rootObj
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms))
}

function googleCode(code) {
  if (code === 'zh') return 'zh-CN'
  if (code === 'zh-TW') return 'zh-TW'
  if (code === 'pt-BR') return 'pt'
  if (code === 'no') return 'no'
  return code
}

function protectPlaceholders(text) {
  return String(text).replace(/\{(\w+)\}/g, '⟦$1⟧')
}

function restorePlaceholders(source, translated) {
  let out = String(translated || '')
    .replace(/⟦(\w+)⟧/g, '{$1}')
    .replace(/\[\[(\w+)\]\]/g, '{$1}')
    .replace(/^["“”']+|["“”']+$/g, '')
    .trim()
  const placeholders = source.match(/\{[^}]+\}/g) || []
  out = out.replace(/\{[^{}]+\}/g, (match) => (placeholders.includes(match) ? match : ''))
  out = out.replace(/\s{2,}/g, ' ').trim()
  for (const ph of placeholders) {
    if (!out.includes(ph)) out = `${out} ${ph}`.trim()
  }
  return out || source
}

async function translateJoined(texts, code) {
  const q = texts.map(protectPlaceholders).join(SEP)
  const url =
    'https://translate.googleapis.com/translate_a/single?client=gtx&sl=en&tl=' +
    encodeURIComponent(googleCode(code)) +
    '&dt=t&q=' +
    encodeURIComponent(q)
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Google HTTP ${res.status}`)
  const data = await res.json()
  const joined = (data[0] || []).map((part) => part[0]).join('')
  const parts = joined.split(SEP)
  if (parts.length !== texts.length) {
    // Separator mangled — translate one by one.
    const out = []
    for (const text of texts) {
      const oneUrl =
        'https://translate.googleapis.com/translate_a/single?client=gtx&sl=en&tl=' +
        encodeURIComponent(googleCode(code)) +
        '&dt=t&q=' +
        encodeURIComponent(text)
      const oneRes = await fetch(oneUrl)
      const oneData = await oneRes.json()
      out.push((oneData[0] || []).map((part) => part[0]).join(''))
      await sleep(80)
    }
    return out
  }
  return parts
}

async function translateLanguage(flatEn, language) {
  const result = { ...flatEn }
  const stringEntries = Object.entries(flatEn).filter(([, v]) => typeof v === 'string')
  const arrayEntries = Object.entries(flatEn).filter(([, v]) => Array.isArray(v))

  const chunkSize = 40
  for (let i = 0; i < stringEntries.length; i += chunkSize) {
    const chunk = stringEntries.slice(i, i + chunkSize)
    process.stdout.write(
      `  strings ${Math.min(i + chunkSize, stringEntries.length)}/${stringEntries.length}   \r`,
    )
    const translated = await translateJoined(
      chunk.map(([, text]) => text),
      language.code,
    )
    chunk.forEach(([key, source], idx) => {
      result[key] = restorePlaceholders(source, translated[idx] || source)
    })
    await sleep(120)
  }
  process.stdout.write('\n')

  for (const [key, items] of arrayEntries) {
    process.stdout.write(`  array ${key} (${items.length})\n`)
    const translated = await translateJoined(items, language.code)
    result[key] = items.map((source, idx) => restorePlaceholders(source, translated[idx] || source))
    await sleep(120)
  }
  return result
}

const LANGUAGES = loadLanguages()
const catalogs = loadTranslations()
fs.mkdirSync(localesDir, { recursive: true })

fs.writeFileSync(path.join(localesDir, 'en.json'), JSON.stringify(catalogs.en, null, 2) + '\n')
fs.writeFileSync(path.join(localesDir, 'fr.json'), JSON.stringify(catalogs.fr, null, 2) + '\n')

const flatEn = flatten(catalogs.en)
const targets = LANGUAGES.filter((lang) => {
  if (lang.code === 'en' || lang.code === 'fr') return false
  if (only && !only.includes(lang.code)) return false
  const dest = path.join(localesDir, `${lang.code}.json`)
  if (!force && fs.existsSync(dest)) {
    console.log(`skip ${lang.code} (exists)`)
    return false
  }
  return true
})

console.log(`Translating ${targets.length} languages…`)
for (const language of targets) {
  console.log(`\n→ ${language.flag} ${language.code} ${language.englishName}`)
  try {
    const flat = await translateLanguage(flatEn, language)
    fs.writeFileSync(path.join(localesDir, `${language.code}.json`), JSON.stringify(unflatten(flat), null, 2) + '\n')
    console.log(`  wrote ${language.code}.json`)
  } catch (err) {
    console.error(`  FAILED ${language.code}:`, err.message || err)
  }
}
console.log('\nDone.')
