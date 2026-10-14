import { MODULE_ID, SYSTEM_ID } from './constants.js'
import { getReserve, onCreateItem, onUpdateItem } from './ammo.js'
import { disableGinzzzuAmmoSync } from './compat-ginzzzu.js'
import { reload } from './reload.js'
import { onRenderActorSheet, onRenderCharacterSheet, onRenderItemSheet, scheduleRefresh } from './sheets.js'
import { log, resolveActor } from './util.js'

Hooks.once('init', () => {
  game.settings.register(MODULE_ID, 'debug', {
    name: `${MODULE_ID}.Settings.Debug.Name`,
    hint: `${MODULE_ID}.Settings.Debug.Hint`,
    scope: 'world',
    config: true,
    type: Boolean,
    default: false
  })
  game.settings.register(MODULE_ID, 'ginzzzuAmmoFix', {
    name: `${MODULE_ID}.Settings.GinzzzuAmmoFix.Name`,
    hint: `${MODULE_ID}.Settings.GinzzzuAmmoFix.Hint`,
    scope: 'world',
    config: true,
    type: Boolean,
    default: true,
    requiresReload: true
  })

  if (game.system.id !== SYSTEM_ID) {
    console.warn(`${MODULE_ID} | Requires the ${SYSTEM_ID} system; staying inactive.`)
    return
  }

  game.modules.get(MODULE_ID).api = Object.freeze({
    /**
     * Top off a firearm from Gear. See scripts/reload.js for the result object.
     * @param {Actor|TokenDocument|string} actor Actor, token, actor id or UUID
     * @param {Item|string} weaponId weapon Item, id or UUID
     * @param {object} [options] { notify: boolean }
     * @returns {Promise<object>}
     */
    reload: (actor, weaponId, options) => reload(actor, weaponId, options),
    /**
     * Rounds of a calibre the actor carries (case/whitespace-insensitive match).
     * @param {Actor|TokenDocument|string} actor
     * @param {string} calibre
     * @returns {number}
     */
    getReserve: (actor, calibre) => getReserve(resolveActor(actor), calibre)
  })

  // This module's own hooks. The one exception, compat-ginzzzu.js, switches off
  // Ginzzzu's double-spending ammo sync once every module has finished init.
  Hooks.once('ready', disableGinzzzuAmmoSync)
  Hooks.on('renderCoC7ModelsActorCharacterSheetV2', onRenderCharacterSheet)
  // Ginzzzu's CoC7 Sheets (optional): its investigator sheet extends ActorSheetV2 directly
  Hooks.on('renderActorSheetV2', onRenderActorSheet)
  Hooks.on('renderItemSheetV2', onRenderItemSheet)
  Hooks.on('createItem', (item, options, userId) => {
    onCreateItem(item, options, userId)
    scheduleRefresh(item.parent)
  })
  Hooks.on('updateItem', (item, changed, options, userId) => {
    onUpdateItem(item, changed, options, userId)
    scheduleRefresh(item.parent)
  })
  Hooks.on('deleteItem', (item) => scheduleRefresh(item.parent))

  log('Initialised')
})
