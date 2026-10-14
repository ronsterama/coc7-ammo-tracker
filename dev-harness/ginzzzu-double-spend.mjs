// Reproduces Ginzzzu CoC7 Sheets 1.0 double ammo use with its real services/ammo-consumption.js,
// replaying CoC7's ranged-card flow (chat-combat-ranged.js), then checks compat-ginzzzu.js.
// Usage: git clone --depth 1 --branch v1.0 https://github.com/Ginzzzu/ginzzzu-coc7-sheets.git <dir>
//        node dev-harness/ginzzzu-double-spend.mjs <dir>
// Re-run against a newer Ginzzzu tag to see whether the upstream bug is fixed.
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
const here = path.dirname(fileURLToPath(import.meta.url))
if (!process.argv[2]) { console.error('Pass the path of a ginzzzu-coc7-sheets checkout'); process.exit(1) }
const SRC = pathToFileURL(path.join(process.argv[2], 'scripts/services/ammo-consumption.js')).href
const FIX = pathToFileURL(path.join(here, '..', 'coc7-ammo-tracker', 'scripts', 'compat-ginzzzu.js')).href

// ---- Foundry stand-ins: Hooks with Foundry's {hook,id,fn,once} entries, fire-and-forget callAll ----
let hid = 0
const registry = {}
globalThis.Hooks = {
  get events () { return registry },
  on (hook, fn) { (registry[hook] ??= []).push({ hook, id: ++hid, fn, once: false }); return hid },
  once (hook, fn) { return this.on(hook, fn) },
  off (hook, fn) { registry[hook] = (registry[hook] ?? []).filter(e => e.fn !== fn && e.id !== fn) },
  callAll (hook, ...args) { for (const e of [...(registry[hook] ?? [])]) e.fn(...args); return true }
}
const settings = { 'CoC7.disregardAmmo': false, 'coc7-ammo-tracker.ginzzzuAmmoFix': true, 'coc7-ammo-tracker.debug': false }
globalThis.game = {
  settings: { get: (ns, k) => settings[`${ns}.${k}`] },
  messages: new Map(),
  modules: new Map([['ginzzzu-coc7-sheets', { active: true }]])
}
globalThis.foundry = { utils: { getProperty: (o, k) => k.split('.').reduce((a, p) => a?.[p], o) }, applications: { instances: new Map() } }
const flush = () => new Promise(r => setTimeout(r, 5))

function makeWeapon (name, ammo) {
  return {
    uuid: `Actor.a.Item.${name}`, type: 'weapon', name, parent: { uuid: 'Actor.a' },
    system: { ammo, bullets: ammo, properties: { rngd: true } },
    async update (changes) { this.system.ammo = changes['system.ammo']; Hooks.callAll('updateItem', this, { system: { ammo: this.system.ammo } }) },
    // CoC7 weapon-system.js shootAmmunition
    async shootAmmunition (n) { if (n <= this.system.ammo) await this.update({ 'system.ammo': this.system.ammo - n }) }
  }
}
let weapons = {}
globalThis.fromUuid = async (uuid) => Object.values(weapons).find(w => w.uuid === uuid) ?? null

/**
 * One attack as CoC7 runs it after Ginzzzu's Attack button:
 * shotsAdded = bullets per "Shoot <target>" click (multiple shots / full auto),
 * or null for a single shot (rolled straight away, counted and spent together).
 */
async function attack (ammo, trackRangedWeaponUse, { shotsAdded = null, singleShot = false }) {
  const weapon = makeWeapon(`w${++hid}`, ammo)
  weapons = { [weapon.name]: weapon }
  trackRangedWeaponUse(weapon) // Ginzzzu's #onWeaponRoll, before actor.weaponCheck
  const message = { id: `m${hid}`, flags: { CoC7: { load: { as: 'CoC7ChatCombatRanged', itemUuid: weapon.uuid, totalBulletsFired: 0, weaponRolled: false } } } }
  game.messages.set(message.id, message)
  Hooks.callAll('createChatMessage', message); await flush()
  const load = message.flags.CoC7.load
  if (singleShot) {
    // rollCard single path: totalBulletsFired++ and shootAmmunition(1), then updateMessage
    load.totalBulletsFired++
    await weapon.shootAmmunition(1)
  } else {
    for (const bullets of shotsAdded) { // addShotAtCurrentTarget + updateMessage, no ammo spent
      load.totalBulletsFired += bullets
      Hooks.callAll('updateChatMessage', message); await flush()
    }
    for (const bullets of shotsAdded) await weapon.shootAmmunition(bullets) // rollCard
  }
  load.weaponRolled = true
  Hooks.callAll('updateChatMessage', message); await flush()
  return weapon.system.ammo
}

const ginzzzu = await import(SRC)
ginzzzu.registerAmmoConsumptionHooks() // Ginzzzu main.js, init

const cases = [
  ['Revolver 6, multiple shots 3x1', 6, { shotsAdded: [1, 1, 1] }, 3],
  ['Revolver 6, single shot', 6, { singleShot: true }, 5],
  ['Double-barrel 2, both barrels', 2, { shotsAdded: [1, 1] }, 0],
  ['Thompson 20, full auto 2 volleys of 5', 20, { shotsAdded: [5, 5] }, 10]
]
console.log('--- Ginzzzu 1.0 hooks active (what players got)')
for (const [label, ammo, opts, expected] of cases) {
  const left = await attack(ammo, ginzzzu.trackRangedWeaponUse, opts)
  console.log(`${label.padEnd(40)} left ${String(left).padStart(2)}  (should be ${expected})${left !== expected ? '  <-- WRONG' : ''}`)
}

const { disableGinzzzuAmmoSync } = await import(FIX)
const removed = disableGinzzzuAmmoSync()
console.log(`\n--- After disableGinzzzuAmmoSync(): removed ${removed} hooks; left: ` + Object.entries(registry).map(([k, v]) => `${k}:${v.length}`).join(' '))
let ok = true
for (const [label, ammo, opts, expected] of cases) {
  const left = await attack(ammo, ginzzzu.trackRangedWeaponUse, opts)
  if (left !== expected) ok = false
  console.log(`${label.padEnd(40)} left ${String(left).padStart(2)}  (should be ${expected})${left !== expected ? '  <-- WRONG' : '  ok'}`)
}

// Setting off and Ginzzzu absent: nothing removed
settings['coc7-ammo-tracker.ginzzzuAmmoFix'] = false
const r1 = disableGinzzzuAmmoSync()
settings['coc7-ammo-tracker.ginzzzuAmmoFix'] = true
game.modules.set('ginzzzu-coc7-sheets', { active: false })
const r2 = disableGinzzzuAmmoSync()
console.log(`\nsetting off -> removed ${r1}; Ginzzzu inactive -> removed ${r2}`)
console.log(ok && r1 === 0 && r2 === 0 && removed === 3 ? 'ALL GOOD' : 'FAILURES')
