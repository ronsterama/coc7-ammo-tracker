// Static server: /module/* -> the ammo tracker module, /hud/* -> Improved Combat Module,
// everything else -> this harness folder
const http = require('http')
const fs = require('fs')
const path = require('path')

const HARNESS = __dirname
const ROUTES = [
  ['/module/', path.join(__dirname, '..', 'coc7-ammo-tracker')],
  ['/hud/', path.join(__dirname, '..', '..', 'Improved Combat Module')]
]
const PORT = Number(process.env.PORT || 8765)
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.hbs': 'text/plain' }

http.createServer((req, res) => {
  const url = decodeURIComponent(req.url.split('?')[0])
  const route = ROUTES.find(([prefix]) => url.startsWith(prefix))
  const base = route ? route[1] : HARNESS
  const rel = route ? url.slice(route[0].length) : (url === '/' ? 'index.html' : url.slice(1))
  const file = path.normalize(path.join(base, rel))
  if (!file.startsWith(path.normalize(base))) { res.writeHead(403); return res.end() }
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404); return res.end('not found') }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' })
    res.end(data)
  })
}).listen(PORT, () => console.log(`harness on http://localhost:${PORT}`))
