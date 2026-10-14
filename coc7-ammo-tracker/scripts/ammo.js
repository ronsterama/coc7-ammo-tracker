import { MODULE_ID, internalOptions } from './constants.js'
import { enqueue, getCalibre, getQuantity, isAmmoItem, isOnActor, log, normalizeCalibre, t } from './util.js'

/**
 * Ammunition items on the actor whose calibre matches, in collection order
 * (oldest first), so the first entry is the stack that survives a merge.
 * @param {Actor} actor
 * @param {string} calibre
 * @returns {Item[]}
 */
export function getAmmoStacks (actor, calibre) {
  const key = normalizeCalibre(calibre)
  if (!actor || !key) return []
  return actor.items.filter(item => isAmmoItem(item) && normalizeCalibre(getCalibre(item)) === key)
}

/**
 * Total rounds of a calibre carried by the actor.
 * @param {Actor} actor
 * @param {string} calibre
 * @returns {number}
 */
export function getReserve (actor, calibre) {
  return getAmmoStacks(actor, calibre).reduce((sum, item) => sum + getQuantity(item), 0)
}

/**
 * Fold the quantities of `others` into `keeper` and delete `others`.
 * Keeper is updated first; if the delete then fails its quantity is restored,
 * so a failure never duplicates ammunition.
 * @param {Actor} actor
 * @param {Item} keeper
 * @param {Item[]} others
 * @returns {Promise<Item>} the keeper after the merge
 */
export async function consolidateStacks (actor, keeper, others) {
  if (!others.length) return keeper
  const previous = keeper.system.quantity
  const total = getQuantity(keeper) + others.reduce((sum, item) => sum + getQuantity(item), 0)
  log('Merging', others.map(i => `${i.name} (${getQuantity(i)})`), 'into', keeper.name, '->', total)
  await actor.updateEmbeddedDocuments('Item', [{ _id: keeper.id, 'system.quantity': total }], internalOptions())
  try {
    await actor.deleteEmbeddedDocuments('Item', others.map(item => item.id), internalOptions())
  } catch (err) {
    await actor.updateEmbeddedDocuments('Item', [{ _id: keeper.id, 'system.quantity': previous }], internalOptions())
    throw err
  }
  return actor.items.get(keeper.id) ?? keeper
}

/**
 * Should this client act on a change made by `userId`?
 * The user who made the change acts; if they can't modify the actor, the
 * active GM acts instead. Every other client ignores it.
 * @param {Actor} actor
 * @param {string} userId
 * @returns {boolean}
 */
export function isResponsibleClient (actor, userId) {
  if (userId === game.user.id) return actor.isOwner
  const gm = game.users.activeGM
  if (!gm?.isSelf) return false
  const user = game.users.get(userId)
  return !user || !actor.testUserPermission(user, 'OWNER')
}

/* -------------------------------------------- */
/*  Hooks                                       */
/* -------------------------------------------- */

/**
 * createItem: a new ammo item joins an existing stack of the same calibre.
 * @param {Item} item
 * @param {object} options
 * @param {string} userId
 */
export function onCreateItem (item, options, userId) {
  if (options?.[MODULE_ID]?.internal) return
  scheduleMerge(item, userId)
}

/**
 * updateItem: an item that becomes ammo, or changes calibre, joins an existing stack.
 * Quantity-only edits are ignored.
 * @param {Item} item
 * @param {object} changed
 * @param {object} options
 * @param {string} userId
 */
export function onUpdateItem (item, changed, options, userId) {
  if (options?.[MODULE_ID]?.internal) return
  const flagChanges = changed?.flags?.[MODULE_ID]
  if (!flagChanges || !('isAmmo' in flagChanges || 'calibre' in flagChanges)) return
  scheduleMerge(item, userId)
}

function scheduleMerge (item, userId) {
  if (!isOnActor(item) || !isAmmoItem(item) || !normalizeCalibre(getCalibre(item))) return
  const actor = item.parent
  if (!isResponsibleClient(actor, userId)) return
  enqueue(actor.uuid, () => mergeNewcomer(actor, item.id)).catch(err => {
    console.error(`${MODULE_ID} | Merge failed`, err)
    ui.notifications.error(t('Notify.MergeFailed'))
  })
}

/**
 * Merge the newcomer into the oldest other stack of its calibre and delete it.
 * Re-reads the actor first: by the time this runs from the queue, an earlier
 * task may already have merged or deleted the item.
 * @param {Actor} actor
 * @param {string} newcomerId
 */
async function mergeNewcomer (actor, newcomerId) {
  const newcomer = actor.items.get(newcomerId)
  if (!newcomer || !isAmmoItem(newcomer)) return
  const existing = getAmmoStacks(actor, getCalibre(newcomer)).filter(item => item.id !== newcomerId)
  if (!existing.length) return
  const [keeper, ...legacy] = existing
  const added = getQuantity(newcomer)
  const merged = await consolidateStacks(actor, keeper, [newcomer, ...legacy])
  ui.notifications.info(t('Notify.Merged', {
    name: newcomer.name,
    count: added,
    target: merged.name,
    total: getQuantity(merged)
  }))
}
