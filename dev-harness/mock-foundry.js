// Minimal stand-in for the Foundry client APIs the module touches.
// Hooks fire synchronously after the in-memory change, as Foundry's do after the DB round trip.

const hookMap = new Map()
window.Hooks = {
  on (name, fn) {
    if (!hookMap.has(name)) hookMap.set(name, [])
    hookMap.get(name).push(fn)
    return fn
  },
  once (name, fn) {
    const wrapper = (...args) => { this.off(name, wrapper); return fn(...args) }
    return this.on(name, wrapper)
  },
  off (name, fn) {
    const list = hookMap.get(name)
    if (list) list.splice(list.indexOf(fn) >>> 0, 1)
  },
  callAll (name, ...args) {
    for (const fn of [...(hookMap.get(name) ?? [])]) fn(...args)
    return true
  }
}

function getProperty (obj, key) {
  return key.split('.').reduce((o, k) => (o == null ? undefined : o[k]), obj)
}
function setProperty (obj, key, value) {
  const parts = key.split('.')
  const last = parts.pop()
  let target = obj
  for (const p of parts) {
    if (typeof target[p] !== 'object' || target[p] === null) target[p] = {}
    target = target[p]
  }
  target[last] = value
}
function expandObject (flat) {
  const out = {}
  for (const [k, v] of Object.entries(flat)) setProperty(out, k, v)
  return out
}
function flatten (obj, prefix = '', out = {}) {
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix ? `${prefix}.${k}` : k
    if (v && typeof v === 'object' && !Array.isArray(v)) flatten(v, key, out)
    else out[key] = v
  }
  return out
}
let idCounter = 0
const randomID = () => `id${(++idCounter).toString().padStart(14, '0')}`

// Bare ApplicationV2 + Handlebars mixin, enough for the Combat HUD class to load and run
class MockApplicationV2 {
  constructor (options = {}) { this.options = options; this.rendered = false }
  async render () { this.rendered = true; return this }
  async close () { this.rendered = false; return this }
}
window.foundry = {
  utils: { getProperty, setProperty, hasProperty: (o, k) => getProperty(o, k) !== undefined, expandObject, randomID },
  applications: {
    instances: new Map(),
    api: { ApplicationV2: MockApplicationV2, HandlebarsApplicationMixin: (Base) => class extends Base {} }
  }
}
window.canvas = { tokens: { controlled: [], get: () => null } }

class Collection extends Map {
  filter (fn) { return [...this.values()].filter(fn) }
  find (fn) { return [...this.values()].find(fn) }
  get contents () { return [...this.values()] }
}

class MockItem {
  constructor (data, parent) {
    Object.assign(this, structuredClone(data))
    this._id = data._id
    this.parent = parent
    this.flags ??= {}
    this.system ??= {}
    this.documentName = 'Item'
  }

  get id () { return this._id }
  get uuid () { return `${this.parent.uuid}.Item.${this.id}` }
  get isOwner () { return this.parent.isOwner }
  async update (changes, options = {}) {
    return this.parent.updateEmbeddedDocuments('Item', [{ _id: this.id, ...changes }], options)
  }

  toObject () { return structuredClone({ _id: this._id, name: this.name, type: this.type, system: this.system, flags: this.flags }) }
}

class MockActor {
  constructor ({ id, name, ownership = {} }) {
    this._id = id
    this.name = name
    this.ownership = ownership
    this.items = new Collection()
    this.apps = {}
    this.pack = null
    this.documentName = 'Actor'
    this.type = 'character'
    this.sheet = null
    this.weaponChecks = []
  }

  // CoC7 actor document-class.js weaponCheck(weaponData, fastForward)
  async weaponCheck (weaponData, fastForward = false) { this.weaponChecks.push(weaponData.uuid) }

  get id () { return this._id }
  get uuid () { return `Actor.${this.id}` }
  get isOwner () { return this.testUserPermission(game.user, 'OWNER') }
  testUserPermission (user, level) { return user.isGM || this.ownership[user.id] === 3 }
  #guard () { if (!this.isOwner) throw new Error(`${game.user.name} lacks permission on ${this.name}`) }

  async createEmbeddedDocuments (name, datas, options = {}) {
    this.#guard()
    await Promise.resolve()
    const docs = datas.map(d => new MockItem({ ...d, _id: (options.keepId && d._id && !this.items.has(d._id)) ? d._id : randomID() }, this))
    for (const d of docs) this.items.set(d.id, d)
    for (const d of docs) Hooks.callAll('createItem', d, options, game.user.id)
    return docs
  }

  async updateEmbeddedDocuments (name, updates, options = {}) {
    this.#guard()
    await Promise.resolve()
    const result = []
    for (const { _id, ...changes } of updates) {
      const item = this.items.get(_id)
      if (!item) throw new Error(`No item ${_id}`)
      const flat = flatten(changes)
      for (const [k, v] of Object.entries(flat)) setProperty(item, k, v)
      result.push(item)
      Hooks.callAll('updateItem', item, expandObject(flat), options, game.user.id)
    }
    return result
  }

  async deleteEmbeddedDocuments (name, ids, options = {}) {
    this.#guard()
    await Promise.resolve()
    const docs = ids.map(id => this.items.get(id)).filter(Boolean)
    for (const d of docs) this.items.delete(d.id)
    for (const d of docs) Hooks.callAll('deleteItem', d, options, game.user.id)
    return docs
  }
}
window.MockActor = MockActor

const settings = new Map()
const users = new Collection()
for (const u of [
  { id: 'gm', name: 'Keeper', isGM: true, active: true },
  { id: 'player', name: 'Player', isGM: false, active: true },
  { id: 'observer', name: 'Observer', isGM: false, active: true }
]) users.set(u.id, { ...u, targets: new Set(), character: null })
Object.defineProperty(users, 'activeGM', { get: () => users.find(u => u.isGM && u.active) ?? null })

window.notifications = []
window.ui = {
  notifications: {
    info: (message) => notifications.push({ type: 'info', message }),
    warn: (message) => notifications.push({ type: 'warn', message }),
    error: (message) => notifications.push({ type: 'error', message })
  }
}

window.game = {
  version: '14.368',
  system: { id: 'CoC7', version: '8.15' },
  user: null,
  users,
  actors: new Collection(),
  modules: new Map([['coc7-ammo-tracker', { id: 'coc7-ammo-tracker', active: true }]]),
  settings: {
    register (ns, key, cfg) { settings.set(`${ns}.${key}`, cfg.default) },
    get (ns, key) {
      if (!settings.has(`${ns}.${key}`)) throw new Error(`Setting ${ns}.${key} not registered`)
      return settings.get(`${ns}.${key}`)
    },
    set (ns, key, value) { settings.set(`${ns}.${key}`, value) }
  },
  i18n: {
    translations: {},
    localize (key) { const v = getProperty(this.translations, key); return typeof v === 'string' ? v : key },
    format (key, data = {}) { return this.localize(key).replace(/{(\w+)}/g, (m, k) => (k in data ? String(data[k]) : m)) }
  }
}
window.switchUser = (id) => {
  game.user = users.get(id)
  game.user.isSelf = true
  for (const u of users.values()) if (u.id !== id) u.isSelf = false
}
switchUser('gm')

window.fromUuidSync = (uuid) => {
  const parts = uuid.split('.')
  const actor = game.actors.get(parts[1])
  if (parts.length === 2) return actor ?? null
  return actor?.items.get(parts[3]) ?? null
}
