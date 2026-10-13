// Layout preview of fictional actual CI component trees, not a device capture.
// Usage: node render-ci-evidence.cjs <artifact-dir> <output-dir>
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto')
const [input, output] = process.argv.slice(2)
if (!input || !output) throw Error('Provide artifact and output directories')
const escape = value => String(value).replace(/[&<>"']/g, char => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[char]))
const unitless = new Set(['opacity', 'fontWeight', 'flex', 'flexGrow', 'flexShrink', 'zIndex'])
const flatten = value => Array.isArray(value) ? Object.assign({}, ...value.map(flatten)) : value && typeof value === 'object' ? value : {}
function css(style) {
  const result = {}
  for (const [key, value] of Object.entries(flatten(style))) {
    if (value == null || typeof value === 'object') continue
    const keys = key === 'paddingHorizontal' ? ['paddingLeft', 'paddingRight'] : key === 'paddingVertical' ? ['paddingTop', 'paddingBottom'] : key === 'marginHorizontal' ? ['marginLeft', 'marginRight'] : key === 'marginVertical' ? ['marginTop', 'marginBottom'] : [key]
    for (const k of keys) result[k.replace(/[A-Z]/g, char => '-' + char.toLowerCase())] = typeof value === 'number' && !unitless.has(k) ? value + 'px' : value
  }
  return Object.entries(result).map(([key, value]) => `${key}:${value}`).join(';')
}
function render(node) {
  if (node == null) return ''
  if (typeof node === 'string') return escape(node)
  if (Array.isArray(node)) return node.map(render).join('')
  const props = node.props || {}, isInput = /TextInput/.test(node.type), isText = !isInput && /Text/.test(node.type)
  const tag = isInput ? props.multiline ? 'textarea' : 'input' : isText ? 'span' : props.accessibilityRole === 'button' ? 'button' : 'div'
  const attributes = `class="${isText ? 'rn-text' : isInput ? 'rn-input' : 'rn-view'}" style="${escape(css(props.style))}"${props.testID ? ` data-testid="${escape(props.testID)}"` : ''}${props.accessibilityLabel ? ` aria-label="${escape(props.accessibilityLabel)}"` : ''}${props.disabled ? ' disabled' : ''}`
  if (isInput) return tag === 'input' ? `<input ${attributes} readonly value="${escape(props.value || '')}" placeholder="${escape(props.placeholder || '')}">` : `<textarea ${attributes} readonly>${escape(props.value || '')}</textarea>`
  const children = render(node.children)
  return `<${tag} ${attributes}>${props.contentContainerStyle ? `<div class="rn-view" style="${escape(css(props.contentContainerStyle))}">${children}</div>` : children}</${tag}>`
}
fs.mkdirSync(output, {recursive: true})
const sources = {}
for (const language of ['ru', 'az', 'en']) {
  const name = `night-correction-${language}.json`, raw = fs.readFileSync(path.join(input, name), 'utf8')
  sources[name] = crypto.createHash('sha256').update(raw).digest('hex')
  fs.writeFileSync(path.join(output, name), raw)
  fs.writeFileSync(path.join(output, `components-${language}.html`), `<!doctype html><html lang="${language}"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Fictional actual CI correction form</title><style>*{box-sizing:border-box}body{margin:0;background:#F1F6F3;color:#13231F;font-family:Arial,sans-serif}header{padding:16px;font-size:13px;line-height:1.5;color:#5E7069}.rn-view{border-style:solid;border-width:0;display:flex;flex-direction:column;min-width:0;flex-shrink:0}.rn-text{display:block;white-space:pre-wrap;overflow-wrap:break-word;min-width:0}.rn-input{width:100%;min-width:0;border-style:solid;resize:none;font:inherit}button{border:0 solid transparent;background:transparent;font:inherit;color:inherit;cursor:default}main{max-width:1000px;margin:auto}</style><header>Fictional CI React Native component tree · ${language.toUpperCase()} · HTML preview, not a native-device screenshot.</header><main>${render(JSON.parse(raw))}</main></html>`)
}
fs.writeFileSync(path.join(output, 'source-sha256.json'), JSON.stringify(sources, null, 2) + '\n')
console.log('Prepared 3 previews from actual fictional CI trees')
