// CoC7 Ammo Tracker: bulk-tag firearms with a calibre + loading style, and create
// one ammunition item per calibre in an "Ammunition" Items folder.
// Paste into a Foundry "Script" macro and run it as the GM.
//
// DRY_RUN = true  -> writes nothing; whispers the plan to you in chat.
// DRY_RUN = false -> applies it. Weapons that already have a calibre are never changed,
//                    and calibres that already have an ammo item get no second one.
const DRY_RUN = true
const SET_MISSING_MAGAZINE = true

const M = 'coc7-ammo-tracker'
const norm = (v) => String(v ?? '').trim().replace(/\s+/g, ' ').toLowerCase()

const DESIG = [['h&h nitro express', 'H&H Nitro Express'], ['nitro express', 'Nitro Express'], ['h&h magnum', 'H&H Magnum'],
  ['webley auto', 'Webley Auto'], ['super auto', 'Super Auto'], ['long colt', 'LC'], ['short rf', 'Short RF'], ['special', 'Special'],
  ['acp', 'ACP'], ['lc', 'LC'], ['webley', 'Webley'], ['winchester', 'Winchester'], ['british', 'British'], ['remington', 'Remington'],
  ['savage', 'Savage'], ['jeffries', 'Jeffery'], ['lr', 'LR'], ['s&w', 'S&W']]
const desigRe = new RegExp('(\\.\\d{2,3}(?:[-/]\\d{2,4})?)(?=[\\s)]|$)(?:\\s+(' + DESIG.map(d => d[0].replace(/[&.]/g, m => '\\' + m)).join('|') + ')\\b)?', 'gi')

function calibreOf (item) {
  const n = item.name.replace(/\s+/g, ' ')
  const has = (r) => r.test(n)
  let m = n.match(/(?:^|[^\d.])(\d{1,2})\s*-?\s*(?:gauge|ga|g)\b/i)
  if (m) return { calibre: `${m[1]}-gauge`, kind: 'shotgun' }
  m = n.match(/(?<![\d.])(\d{1,2}(?:\.\d{1,2})?)\s?x\s?(\d{2,3})\s?(?:mm)?(R)?(?![a-z])/i)
  if (m) return { calibre: `${m[1]}x${m[2]}mm${m[3] ? 'R' : ''}` }
  const hits = [...n.matchAll(desigRe)]
  const withD = hits.find(h => h[2])
  if (withD) return { calibre: `${withD[1]} ${DESIG.find(x => x[0] === withD[2].toLowerCase())[1]}` }
  const bare = hits[0]?.[1]
  if (bare) {
    const auto = has(/automatic|auto\b|pistol/i)
    const g = {
      '.22': ['.22 LR'], '.25': ['.25 ACP'], '.41': [has(/derringer/i) ? '.41 Short RF' : '.41 LC'], '.410': ['.410 bore', 'shotgun'],
      '.32': [auto ? '.32 ACP' : '.32 S&W'], '.38': [auto ? '9x19mm' : '.38 Special'], '.58': ['.58 Minie ball', 'other'],
      '.303': ['.303 British'], '.30-30': ['.30-30 Winchester'],
      '.45': [has(/martini/i) ? '.577/450 Martini-Henry' : auto ? '.45 ACP' : '.45 LC'],
      '.30': [has(/lever/i) ? '.30-30 Winchester' : '.30-06']
    }[bare]
    return g ? { calibre: g[0], kind: g[1] } : { calibre: bare }
  }
  if (has(/luger|parabellum/i)) return { calibre: '9x19mm' }
  if (has(/thompson|tommy|auto-ordnance/i)) return { calibre: '.45 ACP' }
  if (has(/berthier/i)) return { calibre: '8x50mmR' }
  if (has(/elephant/i)) return { calibre: '.470 Nitro Express' }
  if (has(/^hunting rifle$/i)) return { calibre: '.30-06' }
  if (has(/^revolver$/i)) return { calibre: '.38 Special' }
  if (has(/^derringer$/i)) return { calibre: '.41 Short RF' }
  if (has(/air rifle/i)) return { calibre: 'Air rifle pellet', kind: 'other' }
  if (has(/flintlock|musket/i)) return { calibre: 'Black powder & ball', kind: 'other' }
  if (has(/crossbow/i)) return { calibre: 'Crossbow bolt', kind: 'other' }
  if (has(/\bbow\b|arrow/i)) return { calibre: 'Arrow', kind: 'other' }
  return null
}

function loadingOf (item, info) {
  const n = item.name
  const p = item.system.properties ?? {}
  const skill = String(item.system.skill?.main?.name ?? '').toLowerCase()
  const cap = Number(item.system.bullets) || 0
  if (info.kind === 'shotgun' || info.kind === 'other') return 'loose'
  if (/flintlock|musket|martini|derringer|elephant|double|\(\dB/i.test(n)) return 'loose'
  if (p.auto || p.brst) return 'magazine'
  if (/submachine|machine/.test(skill) || /submachine|smg|thompson|tommy|auto-ordnance|schmeisser|bergmann|lewis|bren|vickers|m1917|\bbar\b|rkm|kg m\/21|\br75\b|\br80\b|monitor|mod 1925|beistegui/i.test(n)) return 'magazine'
  if (/revolver|six-shooter|new service|\bsaa\b|police positive|detective special|frontier|snub|webley(?! auto)|nagant|veritable|iver johnson|safety hammerless|military & police/i.test(n) || (/handgun/.test(skill) && /mmR$/.test(info.calibre))) return 'loose'
  if (/handgun/.test(skill)) return 'magazine'
  if (/rifle/.test(skill)) return cap >= 15 ? 'magazine' : 'loose'
  if (/automatic|pistol|luger|parabellum|m1911|government|pocket|woodsman|super|astra|nambu|\bacp\b/i.test(n)) return 'magazine'
  return cap >= 15 ? 'magazine' : 'loose'
}

function capacityFor (item) {
  const n = item.name
  const barrels = n.match(/\((\d)B/i)
  if (barrels) return Number(barrels[1])
  if (/thompson|tommy|auto-ordnance|schmeisser|bergmann/i.test(n)) return 20
  if (/revolver/i.test(n)) return 6
  if (/derringer/i.test(n)) return 2
  if (/pump/i.test(n)) return 5
  if (/bow/i.test(n)) return 1
  return null
}

const SPECIAL = {
  'Arrow': { name: 'Quiver of arrows', qty: 12, img: 'icons/weapons/ammunition/arrows-fletching.webp', folder: 'Other' },
  'Crossbow bolt': { name: 'Bundle of crossbow bolts', qty: 12, img: 'icons/weapons/ammunition/arrow-simple-grey.webp', folder: 'Other' },
  'Black powder & ball': { name: 'Powder and ball', qty: 20, img: 'icons/weapons/ammunition/shot-round-lead.webp', folder: 'Other' },
  '.58 Minie ball': { name: 'Pouch of .58 Minie balls', qty: 20, img: 'icons/weapons/ammunition/shot-round-lead.webp', folder: 'Other' },
  'Air rifle pellet': { name: 'Tin of air rifle pellets', qty: 50, img: 'icons/weapons/ammunition/shot-round-silver.webp', folder: 'Other' }
}
function ammoSpec (calibre, kinds) {
  if (SPECIAL[calibre]) return SPECIAL[calibre]
  if (kinds.has('shotgun')) return { name: `Box of ${calibre} shells`, qty: 25, img: 'icons/weapons/ammunition/ammunition-box-shells.webp', folder: 'Shotgun' }
  if (kinds.has('handgun')) return { name: `Box of ${calibre} cartridges`, qty: 50, img: 'icons/weapons/ammunition/ammunition-bullet-snub.webp', folder: 'Handgun' }
  return { name: `Box of ${calibre} cartridges`, qty: 20, img: 'icons/weapons/ammunition/ammunition-bullet-rifle.webp', folder: 'Rifle' }
}

// ---- collect weapons: Items sidebar, every actor, unlinked token copies ----
const entries = []
for (const i of game.items) entries.push({ owner: null, item: i })
for (const a of game.actors) for (const i of a.items) entries.push({ owner: a, item: i })
for (const s of game.scenes) {
  for (const t of s.tokens) {
    if (t.actorLink || !t.actor) continue
    for (const i of t.actor.items) if (t.delta?.items?.get?.(i.id)) entries.push({ owner: t.actor, item: i })
  }
}

const plan = []
const kinds = {}
const untouched = new Set()
for (const { owner, item } of entries) {
  if (item.type !== 'weapon' || !item.system.properties?.rngd || item.system.properties?.thrown) continue
  const existing = item.flags?.[M]?.calibre
  if (existing) { (kinds[existing] ??= new Set()).add('handgun'); continue }
  const info = calibreOf(item)
  if (!info) { untouched.add(item.name); continue }
  const cap = Number(item.system.bullets) || 0
  const skill = String(item.system.skill?.main?.name ?? '').toLowerCase()
  const kind = info.kind ?? (/handgun/.test(skill) ? 'handgun' : 'rifle')
  ;(kinds[info.calibre] ??= new Set()).add(kind)
  plan.push({ owner, item, calibre: info.calibre, loading: loadingOf(item, info), setCap: SET_MISSING_MAGAZINE && cap === 0 ? capacityFor(item) : null })
}
const haveAmmo = new Set(game.items.filter(i => i.flags?.[M]?.isAmmo).map(i => norm(i.flags[M].calibre)))
const newCalibres = Object.keys(kinds).filter(c => !haveAmmo.has(norm(c))).sort()

if (DRY_RUN) {
  const rows = plan.map(p => `<li>${p.owner ? p.owner.name + ': ' : ''}${p.item.name} → <b>${p.calibre}</b>, ${p.loading}${p.setCap ? `, magazine ${p.setCap}` : ''}</li>`).join('')
  ChatMessage.create({
    whisper: [game.user.id],
    content: `<h3>Ammo Tracker dry run</h3><p>${plan.length} weapons to tag, ${newCalibres.length} new ammo items.</p>` +
      `<ul>${rows}</ul><p>New ammo: ${newCalibres.join(', ') || 'none'}</p><p>Not recognised: ${[...untouched].join(', ') || 'none'}</p>`
  })
  ui.notifications.info(`Ammo Tracker dry run: ${plan.length} weapons, ${newCalibres.length} new ammo items. See chat.`)
} else {
  const errors = []
  let root = game.folders.find(f => f.type === 'Item' && f.name === 'Ammunition' && !f.folder)
  if (!root) root = await Folder.create({ name: 'Ammunition', type: 'Item', sorting: 'a' })
  const sub = {}
  for (const n of ['Handgun', 'Rifle', 'Shotgun', 'Other']) {
    sub[n] = game.folders.find(f => f.type === 'Item' && f.name === n && f.folder?.id === root.id) ??
      await Folder.create({ name: n, type: 'Item', folder: root.id, sorting: 'a' })
  }
  const ammo = newCalibres.map(calibre => {
    const s = ammoSpec(calibre, kinds[calibre])
    return {
      // Observer for everyone: players browse the folder and drag boxes onto their own sheets
      name: s.name, type: 'item', img: s.img, folder: sub[s.folder].id, ownership: { default: CONST.DOCUMENT_OWNERSHIP_LEVELS.OBSERVER },
      system: { quantity: s.qty, weight: 0, description: { value: `<p>${s.qty} rounds of ${calibre}. Change the Quantity to what the investigator actually finds.</p>` } },
      flags: { [M]: { isAmmo: true, calibre } }
    }
  })
  if (ammo.length) await Item.createDocuments(ammo)

  // One update per weapon: batched owner updates can throw on some unlinked token copies
  let done = 0
  for (const p of plan) {
    const u = { _id: p.item.id, [`flags.${M}.calibre`]: p.calibre, [`flags.${M}.loading`]: p.loading }
    if (p.setCap) u['system.bullets'] = p.setCap
    try {
      if (p.owner) await p.owner.updateEmbeddedDocuments('Item', [u])
      else await Item.updateDocuments([u])
      done++
    } catch (err) {
      errors.push(`${p.owner?.name ?? 'Items'}: ${p.item.name} (${err.message})`)
    }
  }
  ui.notifications.info(`Ammo Tracker: tagged ${done} weapons, created ${ammo.length} ammo items.`)
  if (errors.length) {
    console.warn('coc7-ammo-tracker | could not tag', errors)
    ui.notifications.warn(`Ammo Tracker: ${errors.length} weapons could not be tagged. See the console (F12).`)
  }
}
