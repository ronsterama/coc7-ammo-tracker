import { MODULE_ID, LOADING } from './constants.js'

/**
 * console.log, only when the world "debug" setting is on.
 * @param {...any} args
 */
export function log (...args) {
  let enabled = false
  try {
    enabled = game.settings.get(MODULE_ID, 'debug') === true
  } catch (err) {
    enabled = false
  }
  if (enabled) console.log(`${MODULE_ID} |`, ...args)
}

/**
 * Localise a key under this module's namespace.
 * @param {string} key
 * @param {object} [data] format arguments
 * @returns {string}
 */
export function t (key, data) {
  const id = `${MODULE_ID}.${key}`
  return data ? game.i18n.format(id, data) : game.i18n.localize(id)
}

/**
 * Pick the singular or plural form of a count string, e.g. Rounds.One / Rounds.Many.
 * @param {string} key
 * @param {number} n
 * @returns {string}
 */
export function plural (key, n) {
  return t(n === 1 ? `${key}.One` : `${key}.Many`, { n })
}

/**
 * Escape text for places Foundry treats as HTML (data-tooltip).
 * @param {any} value
 * @returns {string}
 */
export function escapeHTML (value) {
  return String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))
}

/* -------------------------------------------- */
/*  Data accessors                              */
/* -------------------------------------------- */

export function getFlag (doc, key) {
  return doc?.flags?.[MODULE_ID]?.[key]
}

/**
 * Comparison key for a calibre: trimmed, inner whitespace collapsed, case-insensitive.
 * ".38  special " and ".38 Special" give the same key.
 * @param {any} value
 * @returns {string}
 */
export function normalizeCalibre (value) {
  return String(value ?? '').trim().replace(/\s+/g, ' ').toLowerCase()
}

/**
 * Calibre as the user typed it (trimmed), for display.
 * @param {Item} item
 * @returns {string}
 */
export function getCalibre (item) {
  return String(getFlag(item, 'calibre') ?? '').trim()
}

export function hasCalibre (item) {
  return normalizeCalibre(getCalibre(item)) !== ''
}

export function getLoading (weapon) {
  return getFlag(weapon, 'loading') === LOADING.MAGAZINE ? LOADING.MAGAZINE : LOADING.LOOSE
}

/**
 * Non-negative whole number, anything else becomes 0.
 * @param {any} value
 * @returns {number}
 */
export function toCount (value) {
  const n = Math.floor(Number(value))
  return Number.isFinite(n) && n > 0 ? n : 0
}

/** CoC7 weapon-system.js: system.bullets is the magazine capacity */
export function getCapacity (weapon) {
  return toCount(weapon?.system?.bullets)
}

/** CoC7 weapon-system.js: system.ammo is the rounds currently loaded */
export function getLoaded (weapon) {
  return toCount(weapon?.system?.ammo)
}

/** CoC7 item-system.js: system.quantity */
export function getQuantity (item) {
  return toCount(item?.system?.quantity)
}

/**
 * Generic CoC7 "item" marked as ammunition by this module.
 * @param {Item} item
 * @returns {boolean}
 */
export function isAmmoItem (item) {
  return item?.type === 'item' && getFlag(item, 'isAmmo') === true
}

/**
 * CoC7 has no firearm flag: the sheet lists a weapon as ranged when
 * system.properties.rngd is true. That also covers thrown rocks and whips,
 * so a firearm additionally needs a magazine capacity (see isFirearm).
 * @param {Item} item
 * @returns {boolean}
 */
export function isRangedWeapon (item) {
  return item?.type === 'weapon' &&
    item.system?.properties?.rngd === true &&
    item.system?.properties?.thrown !== true
}

export function isFirearm (item) {
  return isRangedWeapon(item) && getCapacity(item) > 0
}

/**
 * Item embedded directly in a world/token actor (not a compendium).
 * @param {Item} item
 * @returns {boolean}
 */
export function isOnActor (item) {
  const actor = item?.parent
  return actor?.documentName === 'Actor' && !actor.pack
}

/* -------------------------------------------- */
/*  Reference resolution for the public API     */
/* -------------------------------------------- */

/**
 * Accepts an Actor, a Token / TokenDocument, an actor id or a UUID.
 * @param {any} ref
 * @returns {Actor|null}
 */
export function resolveActor (ref) {
  if (!ref) return null
  if (ref.documentName === 'Actor') return ref
  if (ref.documentName === 'Token' || ref.document?.documentName === 'Token') return ref.actor ?? null
  if (typeof ref === 'string') {
    if (ref.includes('.')) {
      const doc = fromUuidSync(ref)
      if (doc?.documentName === 'Actor') return doc
      return doc?.actor ?? null
    }
    return game.actors.get(ref) ?? null
  }
  return null
}

/**
 * Accepts an Item, an item id or an item UUID belonging to the actor.
 * @param {Actor} actor
 * @param {any} ref
 * @returns {Item|null}
 */
export function resolveItem (actor, ref) {
  if (!actor || !ref) return null
  if (ref.documentName === 'Item') return actor.items.get(ref.id) ?? null
  if (typeof ref === 'string') return actor.items.get(ref) ?? actor.items.get(ref.split('.').pop()) ?? null
  return null
}

/**
 * Item for a sheet row carrying data-item-uuid (CoC7 templates use the item UUID).
 * @param {Actor} actor
 * @param {HTMLElement} row
 * @returns {Item|null}
 */
export function itemFromRow (actor, row) {
  const uuid = row?.dataset?.itemUuid
  if (!uuid) return null
  return actor.items.get(uuid.split('.').pop()) ?? null
}

/* -------------------------------------------- */
/*  Per-actor task queue                        */
/* -------------------------------------------- */

const queues = new Map()

/**
 * Run tasks for one key strictly one after another. Merges and reloads on the
 * same actor go through here so they never read each other's half-written state.
 * @param {string} key
 * @param {Function} task async function
 * @returns {Promise<any>} resolves/rejects with the task's own result
 */
export function enqueue (key, task) {
  const run = (queues.get(key) ?? Promise.resolve()).then(task)
  const tail = run.catch(() => {})
  queues.set(key, tail)
  tail.then(() => {
    if (queues.get(key) === tail) queues.delete(key)
  })
  return run
}
