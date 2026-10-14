import { MockCharacterSheet, MockGinzzzuSheet, MockItemSheet, MockPlainSheet } from './mock-sheets.js'

const MOD = 'coc7-ammo-tracker'
const results = []
window.__results = results
const out = document.getElementById('results')
const settle = (ms = 150) => new Promise(resolve => setTimeout(resolve, ms))
const lastToast = () => notifications.at(-1)?.message ?? ''

function check (name, condition, detail = '') {
  results.push({ name, pass: !!condition, detail })
  const li = document.createElement('li')
  li.className = condition ? 'pass' : 'fail'
  li.textContent = `${condition ? 'PASS' : 'FAIL'}  ${name}${detail ? '  —  ' + detail : ''}`
  out.append(li)
}

// --- Boot the module the way Foundry does: import, load language, fire init ---
const translations = await (await fetch('/module/languages/en.json')).json()
game.i18n.translations = translations
const consoleLogs = []
const origLog = console.log
console.log = (...args) => { consoleLogs.push(args); origLog(...args) }
const errors = []
window.addEventListener('error', (e) => errors.push(e.message))
window.addEventListener('unhandledrejection', (e) => errors.push(String(e.reason)))

await import('/module/scripts/main.js')
Hooks.callAll('init')
Hooks.callAll('ready')
check('module api exposed', typeof game.modules.get(MOD).api?.reload === 'function' && typeof game.modules.get(MOD).api?.getReserve === 'function')
check('no console.log while debug is off', consoleLogs.length === 0, `${consoleLogs.length} logs`)

// Foundry re-renders an actor's sheets when its items change; mimic that
for (const hook of ['createItem', 'updateItem', 'deleteItem']) {
  Hooks.on(hook, (item) => {
    for (const app of Object.values(item.parent?.apps ?? {})) setTimeout(() => app.render(), 0)
  })
}

// --- World ---
const actor = new MockActor({ id: 'inv1', name: 'Harvey Walters', ownership: { player: 3, observer: 2 } })
game.actors.set(actor.id, actor)
const weaponData = (name, calibre, bullets, extra = {}) => ({
  name,
  type: 'weapon',
  system: { bullets, ammo: 0, properties: { rngd: true, thrown: false }, range: { normal: { damage: '1D10' } } },
  flags: calibre ? { [MOD]: { calibre, ...extra } } : {}
})
const ammoData = (name, calibre, quantity) => ({ name, type: 'item', system: { quantity, weight: 0 }, flags: { [MOD]: { isAmmo: true, calibre } } })

const [revolver, shotgun, untagged, automatic] = await actor.createEmbeddedDocuments('Item', [
  weaponData('Revolver', '.38 Special', 6),
  weaponData('12-gauge Shotgun (2B)', '12-gauge', 2),
  weaponData('Old Pistol', '', 6),
  weaponData('.45 Automatic', '.45 ACP', 7, { loading: 'magazine' })
])
await actor.createEmbeddedDocuments('Item', [
  { name: 'Knife', type: 'weapon', system: { bullets: null, ammo: 0, properties: { rngd: false } } },
  { name: 'Bullwhip', type: 'weapon', system: { bullets: null, ammo: 0, properties: { rngd: true } } }
])
const [box38] = await actor.createEmbeddedDocuments('Item', [ammoData('Box of .38 Special cartridges', '.38 Special', 20)])
await settle()

const sheet = new MockCharacterSheet(actor, 'v3', document.getElementById('sheets'))
sheet.render()
const rowOf = (s, w) => s.element.querySelector(`[data-item-uuid="${w.uuid}"]`)
const controlOf = (s, w) => rowOf(s, w)?.querySelector('.cat-reload')
const text = (node) => node?.textContent.replace(/\s+/g, '') ?? ''

// --- Checklist 1: 0 -> 6/6 · 14, 3 combat rounds ---
check('revolver row shows 0/6 · 20 before reload', text(controlOf(sheet, revolver)) === '0/6·20', text(controlOf(sheet, revolver)))
check('melee knife / bullwhip get no control', !rowOf(sheet, actor.items.find(i => i.name === 'Knife')).querySelector('.cat-reload') &&
  !rowOf(sheet, actor.items.find(i => i.name === 'Bullwhip')).querySelector('.cat-reload'))
check('gear list rows get no control', !sheet.element.querySelector('.possessions .cat-reload'))
controlOf(sheet, revolver).click()
await settle()
check('1. reload from 0 loads 6', revolver.system.ammo === 6, `ammo=${revolver.system.ammo}`)
check('1. reserve drops to 14', box38.system.quantity === 14, `qty=${box38.system.quantity}`)
check('1. toast text', lastToast() === 'Revolver (.38 Special) loaded 6 rounds — 3 combat rounds (RAW). Reserve: 14.', lastToast())
check('1. row re-rendered to 6/6 · 14', text(controlOf(sheet, revolver)) === '6/6·14', text(controlOf(sheet, revolver)))

// --- Checklist 2: fire 2 via CoC7's shootAmmunition path, reload -> 6/6 · 12, 1 combat round ---
await revolver.update({ 'system.ammo': 4 }) // CoC7 weapon-system.js shootAmmunition -> setBullets(ammo - n)
await settle()
check('2. after firing 2 the row shows 4/6 · 14', text(controlOf(sheet, revolver)) === '4/6·14', text(controlOf(sheet, revolver)))
controlOf(sheet, revolver).click()
await settle()
check('2. reload tops off to 6/6 · 12', revolver.system.ammo === 6 && box38.system.quantity === 12, `${revolver.system.ammo}/${box38.system.quantity}`)
check('2. toast says 1 combat round', lastToast() === 'Revolver (.38 Special) loaded 2 rounds — 1 combat round (RAW). Reserve: 12.', lastToast())

// --- Gun already full ---
controlOf(sheet, revolver).click()
await settle()
check('already full toast', lastToast() === 'Already fully loaded.', lastToast())
check('already full changes nothing', revolver.system.ammo === 6 && box38.system.quantity === 12)

// --- Checklist 3: shotgun doesn't draw from .38 ---
check('3. shotgun control disabled (no 12-gauge in Gear)', controlOf(sheet, shotgun).classList.contains('cat-disabled'))
controlOf(sheet, shotgun).click()
await settle()
check('3. shotgun reload: "No 12-gauge ammunition."', lastToast() === 'No 12-gauge ammunition.', lastToast())
check('3. shotgun still empty and .38 reserve untouched', shotgun.system.ammo === 0 && box38.system.quantity === 12)

// --- Checklist 4: dropping a second .38 item merges ---
await actor.createEmbeddedDocuments('Item', [ammoData('Loose .38 rounds', '  .38  SPECIAL ', 10)])
await settle()
let stacks38 = actor.items.filter(i => i.flags[MOD]?.isAmmo && i.flags[MOD].calibre.trim().toLowerCase().replace(/\s+/g, ' ') === '.38 special')
check('4. drop merges into one stack (case/space-insensitive)', stacks38.length === 1 && stacks38[0].id === box38.id && box38.system.quantity === 22, `${stacks38.length} stacks, qty ${box38.system.quantity}`)
check('4. merge toast', /^Merged Loose \.38 rounds \(10\) into Box of \.38 Special cartridges\. Now 22\.$/.test(lastToast()), lastToast())

// Edit path: a plain item becomes .38 ammo through its sheet
const [cartons] = await actor.createEmbeddedDocuments('Item', [{ name: 'Carton', type: 'item', system: { quantity: 5 }, flags: {} }])
const itemSheet = new MockItemSheet(cartons, document.getElementById('sheets'))
itemSheet.render()
const ammoRow = itemSheet.element.querySelector('.item-header .item-property .cat-item-ammo')
check('item sheet: Ammunition fields injected under Quantity', !!ammoRow && !!ammoRow.querySelector('.cat-is-ammo') && !!ammoRow.querySelector('.cat-calibre'))
const calInput = ammoRow.querySelector('.cat-calibre')
calInput.value = '.38 special'
calInput.dispatchEvent(new Event('change', { bubbles: true }))
await settle()
check('item sheet: calibre saved to flags', cartons.flags[MOD]?.calibre === '.38 special')
check('item sheet: our change never reaches the CoC7 form submit', itemSheet.formChanges === 0, `form changes=${itemSheet.formChanges}`)
check('item sheet: calibre alone does not merge (not ammo yet)', actor.items.has(cartons.id))
const box = itemSheet.element.querySelector('.cat-is-ammo')
box.checked = true
box.dispatchEvent(new Event('change', { bubbles: true }))
await settle()
check('4b. ticking "Is ammunition" merges the edited item into the existing stack', !actor.items.has(cartons.id) && box38.system.quantity === 27, `qty=${box38.system.quantity}`)

// --- Magazine weapon: 1 combat round ---
const [box45] = await actor.createEmbeddedDocuments('Item', [ammoData('.45 ACP', '.45 acp', 14)])
await settle()
controlOf(sheet, automatic).click()
await settle()
check('magazine loading: 7 rounds in 1 combat round', automatic.system.ammo === 7 && box45.system.quantity === 7 && lastToast() === '.45 Automatic (.45 ACP) loaded 7 rounds — 1 combat round (RAW). Reserve: 7.', lastToast())

// --- Checklist 5: partial load, stack kept at 0 ---
await box38.update({ 'system.quantity': 3 })
await revolver.update({ 'system.ammo': 0 })
await settle()
controlOf(sheet, revolver).click()
await settle()
check('5. partial load to 3/6, reserve 0', revolver.system.ammo === 3 && box38.system.quantity === 0)
check('5. ammo item still in Gear at 0', actor.items.has(box38.id))
check('5. partial toast', lastToast() === 'Partial load: Revolver (.38 Special) loaded 3 rounds, now 3/6 — 2 combat rounds (RAW). Reserve: 0.', lastToast())
check('5. control now disabled with reason tooltip', controlOf(sheet, revolver).classList.contains('cat-disabled') && controlOf(sheet, revolver).dataset.tooltip === 'No .38 Special ammunition.')
controlOf(sheet, revolver).click()
await settle()
check('5. reload with empty reserve: "No .38 Special ammunition."', lastToast() === 'No .38 Special ammunition.' && revolver.system.ammo === 3)

// --- Checklist 6: no calibre ---
const oldPistol = controlOf(sheet, untagged)
check('6. untagged weapon: disabled + tooltip', oldPistol.classList.contains('cat-disabled') && oldPistol.dataset.tooltip === 'Set a calibre on this weapon' && text(oldPistol) === '0/6·–', text(oldPistol))
oldPistol.click()
await settle()
check('6. clicking it explains, changes nothing', lastToast() === 'Set a calibre on this weapon' && untagged.system.ammo === 0)

// --- Checklist 8: CoC7's own control no longer refills for free ---
await box38.update({ 'system.quantity': 20 })
await revolver.update({ 'system.ammo': 0 })
await settle()
sheet.nativeCalls.length = 0
const native = () => rowOf(sheet, revolver).querySelector('.reload-weapon')
native().dispatchEvent(new MouseEvent('click', { bubbles: true, button: 0 }))
await settle()
check('8. CoC7 left-click intercepted (CoC7 handler not run)', sheet.nativeCalls.length === 0)
check('8. CoC7 left-click now draws from Gear', revolver.system.ammo === 6 && box38.system.quantity === 14, `${revolver.system.ammo}/${box38.system.quantity}`)
await revolver.update({ 'system.ammo': 0 })
await settle()
native().dispatchEvent(new MouseEvent('click', { bubbles: true, button: 0, shiftKey: true }))
await settle()
check('8. CoC7 shift+left-click (full reload) intercepted too', sheet.nativeCalls.length === 0 && revolver.system.ammo === 6 && box38.system.quantity === 8, `${revolver.system.ammo}/${box38.system.quantity}`)
native().dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, button: 2 }))
await settle()
check('8. CoC7 right-click (remove 1) still works', sheet.nativeCalls.length === 1 && revolver.system.ammo === 5)
check('8. CoC7 control tooltip explains new behaviour', native().dataset.tooltip.startsWith('Left-click: reload from Gear'))
await untagged.update({ 'system.ammo': 0 })
await settle()
rowOf(sheet, untagged).querySelector('.reload-weapon').dispatchEvent(new MouseEvent('click', { bubbles: true, button: 0, shiftKey: true }))
await settle()
check('8. CoC7 control on an untagged gun cannot refill for free either', untagged.system.ammo === 0 && sheet.nativeCalls.length === 1, lastToast())

// --- Clicking our control doesn't trigger the weapon roll ---
sheet.rollCalls.length = 0
controlOf(sheet, revolver).click()
await settle()
check('control click does not roll the weapon', sheet.rollCalls.length === 0)

// --- Legacy duplicates are consolidated before reloading ---
const legacyOpts = { [MOD]: { internal: true } }
await actor.createEmbeddedDocuments('Item', [ammoData('12ga box A', '12-gauge', 3), ammoData('12ga box B', '12-Gauge', 4)], legacyOpts)
await settle()
check('legacy duplicates exist before reload', actor.items.filter(i => /12ga box/.test(i.name)).length === 2)
check('getReserve sums duplicates', game.modules.get(MOD).api.getReserve(actor, ' 12-GAUGE ') === 7)
controlOf(sheet, shotgun).click()
await settle()
const boxes12 = actor.items.filter(i => /12ga box/.test(i.name))
check('legacy stacks merged, then reload', boxes12.length === 1 && boxes12[0].system.quantity === 5 && shotgun.system.ammo === 2, `${boxes12.length} stacks, qty ${boxes12[0]?.system.quantity}, ammo ${shotgun.system.ammo}`)

// --- Batch drop of two same-calibre items onto an actor with none ---
await actor.createEmbeddedDocuments('Item', [ammoData('9mm A', '9mm', 5), ammoData('9mm B', '9mm', 6)])
await settle()
const nine = actor.items.filter(i => /^9mm/.test(i.name))
check('batch-created duplicates collapse into one stack', nine.length === 1 && nine[0].system.quantity === 11, `${nine.length} stacks`)

// --- Weapon sheet ---
const weaponSheet = new MockItemSheet(revolver, document.getElementById('sheets'))
weaponSheet.render()
const fs = weaponSheet.element.querySelector('section.tab[data-tab="details"] .cat-weapon-ammo')
check('weapon sheet: Ammunition fieldset in Details tab', !!fs && fs.querySelector('.cat-calibre').value === '.38 Special' && fs.querySelector('.cat-loading').value === 'loose')
fs.querySelector('.cat-loading').value = 'magazine'
fs.querySelector('.cat-loading').dispatchEvent(new Event('change', { bubbles: true }))
await settle()
check('weapon sheet: loading saved', revolver.flags[MOD].loading === 'magazine')
await revolver.update({ [`flags.${MOD}.loading`]: 'loose' })
const meleeSheet = new MockItemSheet(actor.items.find(i => i.name === 'Knife'), document.getElementById('sheets'))
meleeSheet.render()
check('melee weapon sheet: no Ammunition fieldset', !meleeSheet.element.querySelector('.cat-weapon-ammo'))
weaponSheet.render()
weaponSheet.render()
check('re-render does not duplicate injected fields', weaponSheet.element.querySelectorAll('.cat-weapon-ammo').length === 1)
sheet.render()
Hooks.callAll('renderCoC7ModelsActorCharacterSheetV2', sheet, sheet.element, {}, {})
check('double render hook keeps one control per row', rowOf(sheet, revolver).querySelectorAll('.cat-reload').length === 1)

// --- Checklist 7: player client, then GM sees it ---
await revolver.update({ 'system.ammo': 0 })
await box38.update({ 'system.quantity': 20 })
switchUser('player')
const playerSheet = new MockCharacterSheet(actor, 'v3', document.getElementById('sheets'))
playerSheet.render()
check('7. player (owner) sees the control', !!controlOf(playerSheet, revolver))
controlOf(playerSheet, revolver).click()
await settle()
check('7. player reload works', revolver.system.ammo === 6 && box38.system.quantity === 14)
await actor.createEmbeddedDocuments('Item', [ammoData('Player .38 box', '.38 Special', 6)])
await settle()
check('7. player-created ammo merges on the player client', !actor.items.find(i => i.name === 'Player .38 box') && box38.system.quantity === 20)
delete actor.apps[playerSheet.id]
playerSheet.element.remove()
switchUser('gm')
sheet.render()
check('7. GM sheet shows the player\'s result', text(controlOf(sheet, revolver)) === '6/6·20', text(controlOf(sheet, revolver)))

// Other clients must not act on someone else's change (simulate the hook arriving from another client)
const [stray] = await actor.createEmbeddedDocuments('Item', [ammoData('Stray .38', '.38 Special', 2)], legacyOpts)
switchUser('observer')
Hooks.callAll('createItem', stray, {}, 'player')
await settle()
switchUser('gm')
Hooks.callAll('createItem', stray, {}, 'player')
await settle()
check('7. GM / observer clients ignore a change the owning player made', actor.items.has(stray.id) && box38.system.quantity === 20)
Hooks.callAll('createItem', stray, {}, 'observer')
await settle()
check('active GM merges when the changing user lacks permission', !actor.items.has(stray.id) && box38.system.quantity === 22, `qty=${box38.system.quantity}`)

// --- Observer: no control ---
switchUser('observer')
const obsSheet = new MockCharacterSheet(actor, 'v3', document.getElementById('sheets'))
obsSheet.render()
check('observer (not owner) sees no control', !obsSheet.element.querySelector('.cat-reload'))
const obsResult = await game.modules.get(MOD).api.reload(actor, revolver.id)
check('observer API reload refused', obsResult.status === 'noPermission')
delete actor.apps[obsSheet.id]
obsSheet.element.remove()
switchUser('gm')

// --- Summarized sheet placement ---
const summary = new MockCharacterSheet(actor, 'summarized', document.getElementById('sheets'))
summary.render()
const sumCtl = controlOf(summary, revolver)
check('summarized sheet: control inside the name flex cell', sumCtl?.parentElement?.classList.contains('weapon-name') && sumCtl.classList.contains('cat-inline'))
summary.rollCalls.length = 0
await revolver.update({ 'system.ammo': 1 })
await settle()
controlOf(summary, revolver).click()
await settle()
check('summarized sheet: click reloads and does not roll', revolver.system.ammo === 6 && summary.rollCalls.length === 0)

// --- API ---
await revolver.update({ 'system.ammo': 0 })
const apiResult = await game.modules.get(MOD).api.reload(actor.id, revolver.uuid, { notify: false })
check('api.reload by actor id + weapon uuid', apiResult.status === 'loaded' && apiResult.toLoad === 6 && apiResult.combatRounds === 3, JSON.stringify(apiResult))
check('api.getReserve by uuid', game.modules.get(MOD).api.getReserve(actor.uuid, '.38 special') === box38.system.quantity)

// --- Concurrency: double click ---
await revolver.update({ 'system.ammo': 0 })
await box38.update({ 'system.quantity': 20 })
await settle()
const api = game.modules.get(MOD).api
await Promise.all([api.reload(actor, revolver.id), api.reload(actor, revolver.id)])
await settle()
check('double reload does not double-spend', revolver.system.ammo === 6 && box38.system.quantity === 14, `${revolver.system.ammo}/${box38.system.quantity}`)

// ===== Ginzzzu's CoC7 Sheets: ammo tracker =====
const gsheet = new MockGinzzzuSheet(actor, document.getElementById('sheets'))
gsheet.gciActiveTab = 'combat'
await revolver.update({ 'system.ammo': 0 })
await box38.update({ 'system.quantity': 20 })
await gsheet.render()
await settle()
const card = (w) => gsheet.element.querySelector(`.gci-weapon-card[data-item-uuid="${w.uuid}"]`)
const gReserve = (w) => card(w)?.querySelector('.cat-gci-reserve')
const gReload = (w) => card(w)?.querySelector('[data-action="gci-reload-weapon"]')
check('G1. Ginzzzu: Gear reserve shown under the ammo count', gReserve(revolver)?.textContent === 'Gear: 20' && gReserve(revolver).parentElement?.tagName === 'STRONG', gReserve(revolver)?.textContent)
check('G1. Ginzzzu: ammo block keeps its 3 grid children', card(revolver).querySelector('.gci-ammo-block').children.length === 3)
check('G1. Ginzzzu: reload button tooltip explains the new behaviour', gReload(revolver)?.dataset.tooltip.startsWith('Left-click: reload from Gear'))
gsheet.nativeCalls.length = 0
gReload(revolver).dispatchEvent(new MouseEvent('click', { bubbles: true, button: 0 }))
await settle()
check('G2. Ginzzzu: left-click intercepted, drawn from Gear', gsheet.nativeCalls.length === 0 && revolver.system.ammo === 6 && box38.system.quantity === 14, `${revolver.system.ammo}/${box38.system.quantity}`)
check('G2. Ginzzzu: reserve redrawn after the reload', gReserve(revolver)?.textContent === 'Gear: 14', gReserve(revolver)?.textContent)
await revolver.update({ 'system.ammo': 0 })
await settle()
gReload(revolver).dispatchEvent(new MouseEvent('click', { bubbles: true, button: 0, shiftKey: true }))
await settle()
check('G3. Ginzzzu: shift+left-click (free full reload) intercepted', gsheet.nativeCalls.length === 0 && revolver.system.ammo === 6 && box38.system.quantity === 8, `${revolver.system.ammo}/${box38.system.quantity}`)
gReload(revolver).dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, button: 2 }))
await settle()
check('G4. Ginzzzu: right-click (remove 1) still reaches the sheet', gsheet.nativeCalls.length === 1 && revolver.system.ammo === 5)
check('G5. Ginzzzu: untagged gun says "No calibre", button greyed', gReserve(untagged)?.textContent === 'No calibre' && gReload(untagged)?.classList.contains('cat-disabled'))
await untagged.update({ 'system.ammo': 0 })
await settle()
gReload(untagged).dispatchEvent(new MouseEvent('click', { bubbles: true, button: 0, shiftKey: true }))
await settle()
check('G5. Ginzzzu: untagged gun cannot refill for free', untagged.system.ammo === 0 && lastToast() === 'Set a calibre on this weapon', lastToast())
const knife = actor.items.find(i => i.name === 'Knife')
check('G6. Ginzzzu: melee weapons get nothing', !!card(knife) && !card(knife).querySelector('.cat-gci-reserve'))
gsheet.gciActiveTab = 'skills'
await gsheet.render()
check('G7. Ginzzzu: other tabs get nothing, no errors', !gsheet.element.querySelector('.cat-gci-reserve'))
gsheet.gciActiveTab = 'combat'
await gsheet.render()
await gsheet.render()
check('G7. Ginzzzu: re-render keeps one reserve line per gun', card(revolver).querySelectorAll('.cat-gci-reserve').length === 1)
sheet.render()
check('G8. CoC7 sheet untouched by the Ginzzzu hook', !sheet.element.querySelector('.cat-gci-reserve') && rowOf(sheet, revolver).querySelectorAll('.cat-reload').length === 1)
switchUser('observer')
await gsheet.render()
check('G9. Ginzzzu: observer sees no reserve line', !gsheet.element.querySelector('.cat-gci-reserve'))
switchUser('gm')
gsheet.close()

// ===== Improved Combat Module (Combat HUD) =====
const { CombatHUD } = await import('/hud/scripts/combat-hud.mjs')
const rollWeapon = CombatHUD.DEFAULT_OPTIONS.actions.rollWeapon
const hudActor = new MockActor({ id: 'inv2', name: 'Ginny Tester', ownership: { player: 3 } })
game.actors.set(hudActor.id, hudActor)
const [hRevolver, hKnife, hRifle] = await hudActor.createEmbeddedDocuments('Item', [
  weaponData('Test Revolver', '.38 Special', 6),
  { name: 'Knife', type: 'weapon', system: { bullets: null, ammo: 0, properties: { rngd: false } } },
  { name: 'Unskilled Rifle', type: 'weapon', system: { bullets: 5, ammo: 5, isSkillSet: false, properties: { rngd: true } } }
])
canvas.tokens.controlled = [{ actor: hudActor }]
const hudButton = (item) => { const b = document.createElement('button'); b.dataset.itemId = item.id; return b }
const names = (list) => list.map(w => w.name).join(',')

const coc7Sheet = new MockCharacterSheet(hudActor, 'v3', document.getElementById('sheets'))
hudActor.sheet = coc7Sheet
let hud = new CombatHUD()
let ctx = await hud._prepareContext({})
check('H1. CoC7 sheet: HUD reads the Combat-tab rows (names not polluted by the ammo counter)', names(ctx.range) === 'Test Revolver,Unskilled Rifle' && names(ctx.melee) === 'Knife' && coc7Sheet.element?.style.visibility === 'hidden', `${names(ctx.range)} | ${names(ctx.melee)}`)
await rollWeapon.call(hud, new MouseEvent('click'), hudButton(hRevolver))
check('H1. CoC7 sheet: click forwarded to the weapon name', coc7Sheet.rollCalls.includes(hRevolver.uuid) && hudActor.weaponChecks.length === 0)
await hud._prepareContext({})
await hud.close()
check('H1. CoC7 sheet: hidden sheet closed with the HUD, even after a re-render', !coc7Sheet.rendered)

const gHud = new MockGinzzzuSheet(hudActor, document.getElementById('sheets'))
hudActor.sheet = gHud
hud = new CombatHUD()
ctx = await hud._prepareContext({})
check('H2. Ginzzzu: weapons listed from the actor\'s items', names(ctx.range) === 'Test Revolver,Unskilled Rifle' && names(ctx.melee) === 'Knife', `${names(ctx.range)} | ${names(ctx.melee)}`)
check('H2. Ginzzzu: weapon without a skill is greyed out', ctx.range.find(w => w.name === 'Unskilled Rifle')?.rollable === false && ctx.range.find(w => w.name === 'Test Revolver')?.rollable === true)
check('H2. Ginzzzu: hidden copy opened on the Combat tab', gHud.rendered && gHud.gciActiveTab === 'combat' && gHud.element.style.visibility === 'hidden')
await rollWeapon.call(hud, new MouseEvent('click'), hudButton(hRevolver))
check('H2. Ginzzzu: HUD clicks Ginzzzu\'s own Attack button', gHud.attackCalls.includes(hRevolver.uuid) && hudActor.weaponChecks.length === 0)
await hud._prepareContext({})
await hud.close()
check('H2. Ginzzzu: closing the HUD closes the copy and restores the tab', !gHud.rendered && gHud.gciActiveTab === 'characteristics', `${gHud.rendered} ${gHud.gciActiveTab}`)

gHud.gciActiveTab = 'skills'
await gHud.render()
hud = new CombatHUD()
ctx = await hud._prepareContext({})
check('H3. Ginzzzu open on another tab: not switched or hidden', gHud.gciActiveTab === 'skills' && gHud.element.style.visibility !== 'hidden' && names(ctx.range) === 'Test Revolver,Unskilled Rifle')
await rollWeapon.call(hud, new MouseEvent('click'), hudButton(hRevolver))
check('H3. no Attack button drawn: falls back to CoC7 weaponCheck', hudActor.weaponChecks.at(-1) === hRevolver.uuid && gHud.attackCalls.length === 1)
await hud.close()
check('H3. a sheet the player opened stays open on their tab', gHud.rendered && gHud.gciActiveTab === 'skills')
gHud.close()

hudActor.sheet = new MockPlainSheet(hudActor, document.getElementById('sheets'))
hud = new CombatHUD()
ctx = await hud._prepareContext({})
const checksBefore = hudActor.weaponChecks.length
await rollWeapon.call(hud, new MouseEvent('click'), hudButton(hKnife))
check('H4. unknown sheet: weapons from items, roll via CoC7 weaponCheck', names(ctx.melee) === 'Knife' && hudActor.weaponChecks.length === checksBefore + 1 && hudActor.weaponChecks.at(-1) === hKnife.uuid)
const n5 = notifications.length
await rollWeapon.call(hud, new MouseEvent('click'), hudButton(hRifle))
check('H5. weapon without a skill: warning, no roll', hudActor.weaponChecks.length === checksBefore + 1 && notifications.length === n5 + 1 && lastToast() === 'COMBATHUD.NoRoll', lastToast())
await hud.close()
canvas.tokens.controlled = []

// --- Debug setting gates logging ---
const n = consoleLogs.length
game.settings.set(MOD, 'debug', true)
await api.reload(actor, revolver.id, { notify: false })
check('debug on -> logs appear', consoleLogs.length > n)
game.settings.set(MOD, 'debug', false)

// Left open for a visual check against Ginzzzu's real CSS
const showcase = new MockGinzzzuSheet(actor, document.getElementById('sheets'))
showcase.gciActiveTab = 'combat'
await revolver.update({ 'system.ammo': 4 })
await showcase.render()
await settle()

check('no uncaught errors', errors.length === 0, errors.join(' | '))
const failed = results.filter(r => !r.pass).length
document.getElementById('summary').textContent = `${results.length - failed}/${results.length} passed`
window.__done = true
