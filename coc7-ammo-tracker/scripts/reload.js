import { LOADING, MODULE_ID, internalOptions } from './constants.js'
import { consolidateStacks, getAmmoStacks } from './ammo.js'
import {
  enqueue, getCalibre, getCapacity, getLoaded, getLoading, getQuantity, hasCalibre,
  isFirearm, log, plural, resolveActor, resolveItem, t
} from './util.js'

const busy = new Set()

/**
 * Top off a firearm from matching-calibre ammunition in the actor's Gear.
 *
 * toLoad = min(capacity - loaded, reserve); weapon and ammo stack are written
 * in a single updateEmbeddedDocuments call. RAW time: loose rounds take
 * ceil(toLoad / 2) combat rounds, a magazine takes 1.
 *
 * @param {Actor|TokenDocument|string} actorRef Actor, token, actor id or UUID
 * @param {Item|string} weaponRef weapon Item, id or UUID
 * @param {object} [options]
 * @param {boolean} [options.notify=true] show the toast
 * @returns {Promise<object>} { status, calibre, capacity, loaded, reserve, toLoad, combatRounds }
 *   status: loaded | partial | full | noAmmo | noCalibre | notFirearm | noPermission | notFound | busy
 */
export async function reload (actorRef, weaponRef, { notify = true } = {}) {
  const say = (type, message) => { if (notify) ui.notifications[type](message) }

  const actor = resolveActor(actorRef)
  const weapon = actor ? resolveItem(actor, weaponRef) : null
  log('Reload requested', actor?.name, weapon?.name)
  if (!actor || weapon?.type !== 'weapon') {
    say('warn', t('Notify.WeaponNotFound'))
    return { status: 'notFound' }
  }
  if (!actor.isOwner) {
    say('warn', t('Notify.NoPermission', { actor: actor.name }))
    return { status: 'noPermission' }
  }
  if (!isFirearm(weapon)) {
    say('warn', t('Notify.NotFirearm', { weapon: weapon.name }))
    return { status: 'notFirearm' }
  }
  if (!hasCalibre(weapon)) {
    say('warn', t('Tooltip.NoCalibre'))
    return { status: 'noCalibre' }
  }

  const key = `${actor.uuid}|${weapon.id}`
  if (busy.has(key)) return { status: 'busy' }
  busy.add(key)
  try {
    return await enqueue(actor.uuid, () => performReload(actor, weapon.id, say))
  } catch (err) {
    console.error(`${MODULE_ID} | Reload failed`, err)
    ui.notifications.error(t('Notify.ReloadFailed'))
    return { status: 'error', error: err }
  } finally {
    busy.delete(key)
  }
}

/**
 * Runs inside the actor's queue, so it reads fresh state.
 * @param {Actor} actor
 * @param {string} weaponId
 * @param {Function} say
 * @returns {Promise<object>}
 */
async function performReload (actor, weaponId, say) {
  const weapon = actor.items.get(weaponId)
  if (!weapon) return { status: 'notFound' }
  const calibre = getCalibre(weapon)

  // Stacks that predate the module (or were created while it was off) may be
  // split; merge them before drawing from them.
  let stacks = getAmmoStacks(actor, calibre)
  if (stacks.length > 1) {
    const [keeper, ...others] = stacks
    await consolidateStacks(actor, keeper, others)
    say('info', t('Notify.Consolidated', { count: stacks.length, calibre, name: keeper.name }))
    stacks = getAmmoStacks(actor, calibre)
  }

  const stack = stacks[0]
  const capacity = getCapacity(weapon)
  const loaded = getLoaded(weapon)
  const reserve = getQuantity(stack)
  const gap = Math.max(0, capacity - loaded)
  const state = { calibre, capacity, loaded, reserve, toLoad: 0, combatRounds: 0 }

  if (gap === 0) {
    say('info', t('Notify.AlreadyFull'))
    return { status: 'full', ...state }
  }
  if (!stack || reserve === 0) {
    say('warn', t('Notify.NoAmmo', { calibre }))
    return { status: 'noAmmo', ...state }
  }

  const toLoad = Math.min(gap, reserve)
  const newLoaded = loaded + toLoad
  const newReserve = reserve - toLoad
  // Both writes in one call. An emptied stack stays in Gear at 0 so its calibre tag survives.
  await actor.updateEmbeddedDocuments('Item', [
    { _id: weapon.id, 'system.ammo': newLoaded },
    { _id: stack.id, 'system.quantity': newReserve }
  ], internalOptions())

  const combatRounds = getLoading(weapon) === LOADING.MAGAZINE ? 1 : Math.ceil(toLoad / 2)
  const partial = toLoad < gap
  log('Reloaded', weapon.name, { calibre, loaded, toLoad, newLoaded, reserve, newReserve, combatRounds, partial })

  say('info', t(partial ? 'Notify.PartialLoad' : 'Notify.Loaded', {
    weapon: weapon.name,
    calibre,
    rounds: plural('Rounds', toLoad),
    time: plural('CombatRounds', combatRounds),
    loaded: newLoaded,
    capacity,
    reserve: newReserve
  }))

  return {
    status: partial ? 'partial' : 'loaded',
    calibre,
    capacity,
    loaded: newLoaded,
    reserve: newReserve,
    toLoad,
    combatRounds
  }
}
