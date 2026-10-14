import { MODULE_ID } from './constants.js'
import { log } from './util.js'

/**
 * Ginzzzu's CoC7 Sheets 1.0 double-spends ammunition on multi-shot and
 * full-auto attacks made from its sheets (services/ammo-consumption.js).
 *
 * CoC7's ranged card counts shots when each one is added ("Shoot <target>",
 * flags.CoC7.load.totalBulletsFired goes up) and only spends the rounds when
 * the card is rolled ("Shoot !!!", shootAmmunition). Ginzzzu's chat hooks
 * "repair" the weapon to initialAmmo - totalBulletsFired on every card
 * update, assuming CoC7 had already spent them, so each added shot is
 * deducted once by Ginzzzu and again by CoC7: 6 rounds, 3 shots -> empty.
 *
 * CoC7 already spends the rounds itself, so the fix is to switch off
 * Ginzzzu's three chat-card hooks. Its other hooks are left alone.
 */
const GINZZZU_ID = 'ginzzzu-coc7-sheets'
const SYNC_HOOKS = ['createChatMessage', 'updateChatMessage', 'deleteChatMessage']
/** Error texts that only appear inside Ginzzzu's ammo-sync hook wrappers */
const SIGNATURES = ['Failed to synchronize ammunition', 'Failed to clear ammunition card tracking']

/**
 * Remove Ginzzzu's ammo-sync hooks on this client. Run after every module's
 * init (Ginzzzu registers them in init) and before any chat card exists.
 * @returns {number} hooks removed
 */
export function disableGinzzzuAmmoSync () {
  if (!game.modules.get(GINZZZU_ID)?.active) return 0
  if (game.settings.get(MODULE_ID, 'ginzzzuAmmoFix') !== true) {
    log('Ginzzzu ammo fix is switched off in settings')
    return 0
  }
  let removed = 0
  for (const hook of SYNC_HOOKS) {
    for (const entry of [...(Hooks.events?.[hook] ?? [])]) {
      const fn = entry?.fn ?? entry
      if (typeof fn !== 'function') continue
      const source = Function.prototype.toString.call(fn)
      if (!SIGNATURES.some(text => source.includes(text))) continue
      Hooks.off(hook, fn)
      removed++
    }
  }
  log(`Switched off ${removed} Ginzzzu ammo-sync hook(s); CoC7 spends ammunition itself`)
  return removed
}
