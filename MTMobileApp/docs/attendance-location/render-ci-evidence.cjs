// Render fictional CI React Native host trees for layout inspection only.
// This is not a device/emulator screenshot and cannot prove native permissions.
// Usage: node render-ci-evidence.cjs <downloaded-artifact-dir> <output-dir>
const fs = require('fs'), path = require('path')
const [input, output] = process.argv.slice(2)
if (!input || !output) throw new Error('Provide CI artifact and output directories')
const escape = value => String(value).replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]))
const unitless = new Set(['opacity','fontWeight','flex','flexGrow','flexShrink','zIndex'])
function flatten(style) { return Array.isArray(style) ? Object.assign({}, ...style.map(flatten)) : style && typeof style === 'object' ? style : {} }
function css(style) {
  const source = flatten(style), result = {}
  for (const [key, value] of Object.entries(source)) {
    if (value == null || typeof value === 'object') continue
    const keys = key === 'paddingHorizontal' ? ['paddingLeft','paddingRight'] : key === 'paddingVertical' ? ['paddingTop','paddingBottom'] : key === 'marginHorizontal' ? ['marginLeft','marginRight'] : key === 'marginVertical' ? ['marginTop','marginBottom'] : [key]
    for (const k of keys) result[k.replace(/[A-Z]/g, char=>'-'+char.toLowerCase())] = typeof value === 'number' && !unitless.has(k) ? value+'px' : value
  }
  return Object.entries(result).map(([key,value])=>`${key}:${value}`).join(';')
}
function render(node) {
  if (node == null) return ''
  if (typeof node === 'string') return escape(node)
  if (Array.isArray(node)) return node.map(render).join('')
  const props = node.props || {}, isText = /Text/.test(node.type), isSwitch = /Switch/.test(node.type), button = props.accessibilityRole === 'button'
  const tag = isText ? 'span' : button ? 'button' : 'div'
  return `<${tag} class="${isText?'rn-text':'rn-view'}" style="${escape(css(props.style))}"${props.disabled?' disabled':''}${props.testID?` data-testid="${escape(props.testID)}"`:''}>${isSwitch?`<input type="checkbox" aria-label="${escape(props.accessibilityLabel || '')}" disabled${props.value?' checked':''}>`:render(node.children)}</${tag}>`
}
fs.mkdirSync(output,{recursive:true})
for (const language of ['ru','az','en']) {
  const names = [`office-return-${language}`,`mark-outside-${language}`,`mark-mock-${language}`,`location-off-${language}`,`location-consent-${language}`]
  const sections = names.map(name => `<section><h2>${escape(name)}</h2><div class="phone">${render(JSON.parse(fs.readFileSync(path.join(input,name+'.json'),'utf8')))}</div></section>`).join('')
  const html = `<!doctype html><html lang="${language}"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Fictional actual CI component renders</title><style>*{box-sizing:border-box}body{margin:0;background:#edf1ee;color:#163e34;font-family:Arial,sans-serif}header{padding:20px;font-size:14px;line-height:1.6}main{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:16px;padding:16px}section{min-width:0}h2{font-size:12px;font-weight:400;color:#496459;margin:0 0 10px}.phone{background:#f5f7f3;border:1px solid #cedbd0;border-radius:24px;overflow:hidden;max-width:430px;margin:auto;min-height:100px}.rn-view{border-style:solid;border-width:0;display:flex;flex-direction:column;min-width:0;flex-shrink:0}.rn-text{display:block;white-space:pre-wrap;overflow-wrap:break-word;min-width:0}button{border:0 solid transparent;background:transparent;font:inherit;cursor:default;color:inherit}input{width:44px;height:28px} @media(max-width:700px){main{grid-template-columns:1fr;padding:12px;gap:24px}header{padding:12px}}</style><header>Fictional CI React Native component trees · ${language.toUpperCase()} · HTML layout preview, not a native-device screenshot. Coordinates and real personal data are absent.</header><main>${sections}</main></html>`
  fs.writeFileSync(path.join(output,`components-${language}.html`),html)
}
console.log('Prepared 3 previews from 15 CI component trees')
