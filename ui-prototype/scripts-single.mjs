// Make one self-contained HTML file from the Vite build (inline CSS and JS).
// node scripts-single.mjs <dist dir> <out file> [--fragment]
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const [dist, out, flag] = process.argv.slice(2)
let html = readFileSync(join(dist, 'index.html'), 'utf8')
html = html.replace(/<link rel="stylesheet"[^>]*href="\.\/([^"]+)"[^>]*>/g, (_, f) => `<style>${readFileSync(join(dist, f), 'utf8')}</style>`)
html = html.replace(/<script type="module"[^>]*src="\.\/([^"]+)"[^>]*><\/script>/g, (_, f) => {
  const js = readFileSync(join(dist, f), 'utf8').replace(/<\/script/gi, '<\\/script')
  return `<script type="module">${js}</script>`
})
if (flag === '--fragment') {
  const title = '<title>PG Manager Prototype</title>'
  const head = html.match(/<head>([\s\S]*)<\/head>/)[1].replace(/<meta charset[^>]*>|<meta name="viewport"[^>]*>|<title>[^<]*<\/title>/g, '')
  const body = html.match(/<body>([\s\S]*)<\/body>/)[1]
  html = `${title}\n${head}\n${body}`
}
writeFileSync(out, html)
console.log(out, (html.length / 1024).toFixed(0), 'KB')
