import { LOADING, MODULE_ID } from './constants.js'
import { getReserve } from './ammo.js'
import { reload } from './reload.js'
import {
  escapeHTML, getCalibre, getCapacity, getFlag, getLoaded, getLoading, hasCalibre,
  isFirearm, isRangedWeapon, itemFromRow, log, t
} from './util.js'

/** Character sheet app -> the function that redraws its controls, for in-place refreshes */
const decoratedSheets = new WeakMap()
/** Sheet root elements that already carry the reload interception listener */
const interceptedRoots = new WeakSet()

/** CoC7's own reload icon (global-sheet.js) */
const COC7_RELOAD = '.reload-weapon'
/** Ginzzzu's CoC7 Sheets investigator sheet (module ginzzzu-coc7-sheets) */
const GINZZZU_SHEET = 'gci-character-window'
const GINZZZU_RELOAD = '[data-action="gci-reload-weapon"]'

function el (tag, className, text) {
  const node = document.createElement(tag)
  if (className) node.className = className
  if (text !== undefined) node.textContent = text
  return node
}

function rootOf (app, element) {
  if (element instanceof HTMLElement) return element
  if (element?.[0] instanceof HTMLElement) return element[0]
  return app?.element instanceof HTMLElement ? app.element : null
}

/* -------------------------------------------- */
/*  Character sheet: weapon row control         */
/* -------------------------------------------- */

/**
 * renderCoC7ModelsActorCharacterSheetV2 — fires for the V2, V3 and both
 * summarized character sheets (they all extend that class).
 * @param {ApplicationV2} app
 * @param {HTMLElement} element
 */
export function onRenderCharacterSheet (app, element) {
  const actor = app.document
  const root = rootOf(app, element)
  if (!root || actor?.documentName !== 'Actor') return
  decoratedSheets.set(app, decorateWeaponRows)
  interceptReloadClicks(app, root, COC7_RELOAD)
  decorateWeaponRows(actor, root)
}

/**
 * renderActorSheetV2 — picks out Ginzzzu's investigator sheet, which builds on
 * ActorSheetV2 directly rather than on CoC7's sheet classes. It marks its
 * window with .gci-character-window in _onRender, before this hook runs.
 * Without that module installed this never matches.
 * @param {ApplicationV2} app
 * @param {HTMLElement} element
 */
export function onRenderActorSheet (app, element) {
  const actor = app.document
  const root = rootOf(app, element)
  if (!root?.classList.contains(GINZZZU_SHEET) || actor?.documentName !== 'Actor') return
  decoratedSheets.set(app, decorateGinzzzuCards)
  interceptReloadClicks(app, root, GINZZZU_RELOAD)
  decorateGinzzzuCards(actor, root)
}

/**
 * Add (or rebuild) the control on every firearm row. Idempotent.
 * CoC7 marks ranged weapon rows with a.reload-weapon inside [data-item-uuid].
 * @param {Actor} actor
 * @param {HTMLElement} root
 */
function decorateWeaponRows (actor, root) {
  for (const old of root.querySelectorAll('.cat-reload')) old.remove()
  for (const row of root.querySelectorAll('[data-item-uuid]')) {
    const native = row.querySelector(COC7_RELOAD)
    if (!native && !row.querySelector('.weapon-name')) continue
    const weapon = itemFromRow(actor, row)
    if (weapon?.type !== 'weapon') continue
    if (native) native.dataset.tooltip = t('Tooltip.NativeReload')
    if (!actor.isOwner || !isFirearm(weapon)) continue
    placeControl(row, buildControl(actor, weapon))
  }
}

/**
 * Ginzzzu's weapon cards already show "AMMO loaded / capacity" with a reload
 * button; add the Gear reserve under the count. Idempotent.
 * @param {Actor} actor
 * @param {HTMLElement} root
 */
function decorateGinzzzuCards (actor, root) {
  for (const old of root.querySelectorAll('.cat-gci-reserve')) old.remove()
  for (const card of root.querySelectorAll('.gci-weapon-card[data-item-uuid]')) {
    const block = card.querySelector('.gci-ammo-block')
    const weapon = itemFromRow(actor, card)
    if (!block || weapon?.type !== 'weapon') continue
    const native = block.querySelector(GINZZZU_RELOAD)
    if (native) native.dataset.tooltip = t('Tooltip.NativeReload')
    if (!actor.isOwner || !isFirearm(weapon)) continue

    const state = describeAmmo(actor, weapon)
    native?.classList.toggle('cat-disabled', state.disabled)
    const reserve = el('span', 'cat-gci-reserve' + (state.disabled ? ' cat-disabled' : ''),
      state.tagged ? t('Ginzzzu.Reserve', { n: state.reserve }) : t('Ginzzzu.NoCalibre'))
    reserve.dataset.tooltip = state.tooltip
    reserve.setAttribute('aria-label', state.label)
    // The block is a 3-row grid (label, count, button): a second line inside the count keeps it intact
    const count = block.querySelector('strong')
    if (count) count.append(reserve)
    else block.append(reserve)
  }
}

/**
 * Reserve and reason text shared by both sheet layouts.
 * data-tooltip is rendered as HTML by Foundry, so the user-typed calibre is escaped there.
 * @param {Actor} actor
 * @param {Item} weapon
 * @returns {{calibre: string, tagged: boolean, reserve: number, disabled: boolean, tooltip: string, label: string}}
 */
function describeAmmo (actor, weapon) {
  const calibre = getCalibre(weapon)
  const tagged = hasCalibre(weapon)
  const reserve = tagged ? getReserve(actor, calibre) : 0
  const describe = (shownCalibre) => {
    if (!tagged) return t('Tooltip.NoCalibre')
    if (reserve === 0) return t('Notify.NoAmmo', { calibre: shownCalibre })
    const mode = t(getLoading(weapon) === LOADING.MAGAZINE ? 'Tooltip.ModeMagazine' : 'Tooltip.ModeLoose')
    return t('Tooltip.Reload', { calibre: shownCalibre, mode })
  }
  return {
    calibre,
    tagged,
    reserve,
    disabled: !tagged || reserve === 0,
    tooltip: describe(escapeHTML(calibre)),
    label: describe(calibre).replace(/<br\s*\/?>/gi, '. ')
  }
}

/**
 * Compact "⟳ loaded/capacity · reserve" control.
 * @param {Actor} actor
 * @param {Item} weapon
 * @returns {HTMLElement}
 */
function buildControl (actor, weapon) {
  const { tagged, reserve, disabled, tooltip, label } = describeAmmo(actor, weapon)

  const control = el('a', 'cat-reload' + (disabled ? ' cat-disabled' : ''))
  control.dataset.catWeaponId = weapon.id
  control.dataset.tooltip = tooltip
  control.setAttribute('role', 'button')
  control.setAttribute('tabindex', '0')
  control.setAttribute('aria-disabled', String(disabled))
  control.setAttribute('aria-label', label)

  const icon = el('i', 'fa-solid fa-rotate cat-icon')
  icon.setAttribute('aria-hidden', 'true')
  control.append(
    icon,
    el('span', 'cat-loaded', `${getLoaded(weapon)}/${getCapacity(weapon)}`),
    el('span', 'cat-sep', '·'),
    el('span', 'cat-reserve', tagged ? String(reserve) : '–')
  )

  const activate = (event) => {
    event.preventDefault()
    event.stopPropagation()
    // Disabled controls still answer a click with the reason (no calibre / no ammo)
    control.classList.add('cat-busy')
    reload(actor, weapon.id).finally(() => control.classList.remove('cat-busy'))
  }
  control.addEventListener('click', activate)
  control.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' || event.key === ' ') activate(event)
  })
  // Keep the row's own roll / context / edit handlers out of it
  for (const type of ['contextmenu', 'dblclick']) {
    control.addEventListener(type, (event) => event.stopPropagation())
  }
  return control
}

/**
 * The weapon-controls column is 44px wide in CoC7, so the control sits in the
 * flexible name column instead.
 * @param {HTMLElement} row
 * @param {HTMLElement} control
 */
function placeControl (row, control) {
  const name = row.querySelector('.weapon-name:not(.alternative-skill)')
  if (name?.classList.contains('flexrow')) {
    // Summarized sheet: the name cell is itself a flex row
    control.classList.add('cat-inline')
    name.append(control)
  } else if (name) {
    // V2 / V3 combat tab: float right inside the name cell, before the name
    control.classList.add('cat-float')
    name.before(control)
  } else {
    const controls = row.querySelector('.weapon-controls, .item-controls')
    if (controls) controls.prepend(control)
    else row.append(control)
  }
}

/**
 * CoC7's a.reload-weapon, and Ginzzzu's copy of it, refill for free on
 * left-click (+1) and shift+left-click (full). Capture left-clicks on the
 * sheet root before they reach the sheet's own listener and reload from Gear
 * instead. Right-click (remove one round) and shift+right-click (empty) still
 * reach the sheet untouched.
 * Bound once per root: ApplicationV2 keeps the root across re-renders.
 * @param {ApplicationV2} app
 * @param {HTMLElement} root
 * @param {string} selector the sheet's reload control
 */
function interceptReloadClicks (app, root, selector) {
  if (interceptedRoots.has(root)) return
  interceptedRoots.add(root)
  root.addEventListener('click', (event) => {
    if (event.button !== 0) return
    const native = event.target?.closest?.(selector)
    if (!native || !root.contains(native)) return
    const actor = app.document
    const weapon = itemFromRow(actor, native.closest('[data-item-uuid]'))
    if (weapon?.type !== 'weapon') return
    event.preventDefault()
    event.stopPropagation()
    event.stopImmediatePropagation()
    log('Intercepted sheet reload control for', weapon.name)
    reload(actor, weapon.id)
  }, { capture: true })
}

/* -------------------------------------------- */
/*  Refresh when the actor's items change       */
/* -------------------------------------------- */

const pendingRefresh = new Map()

/**
 * Debounced in-place refresh of the row controls on every open character
 * sheet of the actor. Foundry normally re-renders the sheet anyway (and the
 * render hook redraws the control); this covers partial renders.
 * @param {Actor} actor
 */
export function scheduleRefresh (actor) {
  if (actor?.documentName !== 'Actor') return
  const key = actor.uuid
  clearTimeout(pendingRefresh.get(key))
  pendingRefresh.set(key, setTimeout(() => {
    pendingRefresh.delete(key)
    const apps = new Set(Object.values(actor.apps ?? {}))
    for (const app of foundry.applications?.instances?.values?.() ?? []) {
      if (app.document === actor) apps.add(app)
    }
    for (const app of apps) {
      const decorate = decoratedSheets.get(app)
      if (decorate && app.rendered && app.element instanceof HTMLElement) decorate(actor, app.element)
    }
  }, 50))
}

/* -------------------------------------------- */
/*  Item sheets: ammo item & weapon fields      */
/* -------------------------------------------- */

/**
 * renderItemSheetV2 — CoC7 item and weapon sheets both extend ItemSheetV2.
 * @param {ApplicationV2} app
 * @param {HTMLElement} element
 */
export function onRenderItemSheet (app, element) {
  const item = app.document
  const root = rootOf(app, element)
  if (!root || item?.documentName !== 'Item') return
  for (const old of root.querySelectorAll('.cat-injected')) old.remove()
  // Items embedded inside other items (occupation/setup lists) aren't real documents to update
  if (item.parent?.documentName === 'Item') return
  if (item.type === 'item') injectAmmoItemFields(app, root, item)
  else if (isRangedWeapon(item)) injectWeaponFields(app, root, item)
}

function canEdit (app, item) {
  return app.isEditable !== false && item.isOwner
}

/**
 * Save a flag from one of our inputs. The inputs carry no name attribute and
 * stop their change event, so the CoC7 sheet's own submit never sees them.
 * @param {HTMLElement} input
 * @param {Item} item
 * @param {string} key
 * @param {Function} read returns the value to store
 */
function bindFlagInput (input, item, key, read) {
  input.addEventListener('change', async (event) => {
    event.stopPropagation()
    const value = read()
    if ((getFlag(item, key) ?? '') === value) return
    try {
      await item.update({ [`flags.${MODULE_ID}.${key}`]: value })
    } catch (err) {
      console.error(`${MODULE_ID} | Could not save ${key}`, err)
      ui.notifications.error(t('Notify.SaveFailed'))
    }
  })
  if (input.type === 'text') {
    // Enter would submit the sheet form; commit our field instead
    input.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        event.preventDefault()
        input.blur()
      }
    })
  }
}

function textInput (className, value, placeholder, disabled) {
  const input = el('input', className)
  input.type = 'text'
  input.value = value
  input.placeholder = placeholder
  input.disabled = disabled
  return input
}

/**
 * "Is ammunition" + Calibre, under Quantity/Weight in the item sheet header.
 * @param {ApplicationV2} app
 * @param {HTMLElement} root
 * @param {Item} item
 */
function injectAmmoItemFields (app, root, item) {
  const locked = !canEdit(app, item)
  const wrap = el('div', 'cat-injected cat-item-ammo')

  const checkLabel = el('label', 'cat-check')
  const check = el('input', 'cat-is-ammo')
  check.type = 'checkbox'
  check.checked = getFlag(item, 'isAmmo') === true
  check.disabled = locked
  checkLabel.append(check, el('span', null, t('Item.IsAmmo')))

  const calibreLabel = el('label', 'cat-field')
  const calibre = textInput('cat-calibre', getCalibre(item), t('CalibrePlaceholder'), locked)
  calibreLabel.append(el('span', 'cat-label', t('Calibre')), calibre)

  wrap.append(checkLabel, calibreLabel)
  bindFlagInput(check, item, 'isAmmo', () => check.checked)
  bindFlagInput(calibre, item, 'calibre', () => calibre.value.trim())

  const anchor = root.querySelector('.item-header .item-property')
  if (anchor) anchor.append(wrap)
  else root.querySelector('.window-content')?.prepend(wrap)
}

/**
 * Ammunition fieldset (Calibre + Loading) at the end of the weapon Details tab.
 * @param {ApplicationV2} app
 * @param {HTMLElement} root
 * @param {Item} item
 */
function injectWeaponFields (app, root, item) {
  const locked = !canEdit(app, item)
  const fieldset = el('fieldset', 'cat-injected cat-weapon-ammo')
  fieldset.append(el('legend', null, t('Weapon.Legend')))

  const grid = el('div', 'cat-grid')

  const calibreLabel = el('label', 'cat-field')
  const calibre = textInput('cat-calibre', getCalibre(item), t('CalibrePlaceholder'), locked)
  calibreLabel.append(el('span', 'cat-label', t('Calibre')), calibre)

  const loadingLabel = el('label', 'cat-field')
  const loading = el('select', 'cat-loading')
  loading.disabled = locked
  for (const [value, key] of [[LOADING.LOOSE, 'Weapon.LoadingLoose'], [LOADING.MAGAZINE, 'Weapon.LoadingMagazine']]) {
    const option = el('option', null, t(key))
    option.value = value
    loading.append(option)
  }
  loading.value = getLoading(item)
  loadingLabel.append(el('span', 'cat-label', t('Weapon.Loading')), loading)

  grid.append(calibreLabel, loadingLabel)
  fieldset.append(grid)
  fieldset.append(el('p', 'cat-hint', t(getCapacity(item) > 0 ? 'Weapon.Hint' : 'Weapon.NoCapacityHint')))

  bindFlagInput(calibre, item, 'calibre', () => calibre.value.trim())
  bindFlagInput(loading, item, 'loading', () => loading.value)

  const anchor = root.querySelector('section.tab[data-tab="details"]')
  if (anchor) anchor.append(fieldset)
  else root.querySelector('.window-content')?.append(fieldset)
}
