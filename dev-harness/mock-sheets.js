// DOM stand-ins for the CoC7 8.15 sheets, copied from
// static/templates/actors/investigator-v3/tabs/combat.hbs, investigator-summarized-v2/body.hbs,
// static/templates/items/item-v2-header.hbs and weapon-tab-details.hbs.

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]))

export class MockCharacterSheet {
  constructor (actor, variant = 'v3', container = document.body) {
    this.document = actor
    this.variant = variant
    this.container = container
    this.id = `sheet-${actor.id}-${variant}`
    this.isEditable = true
    this.rendered = false
    this.element = null
    this.nativeCalls = []
    this.rollCalls = []
  }

  render () {
    if (!this.element) {
      this.element = document.createElement('form')
      this.element.className = 'application coc7 sheet actor character ' + (this.variant === 'summarized' ? 'npc investigator-summarized' : 'investigator')
      this.element.dataset.variant = this.variant
      this.container.append(this.element)
      this.document.apps[this.id] = this
    }
    const actor = this.document
    const weapons = actor.items.filter(i => i.type === 'weapon')
    const ranged = weapons.filter(w => w.system.properties.rngd)
    const melee = weapons.filter(w => !w.system.properties.rngd)
    const gear = actor.items.filter(i => i.type === 'item')
    const html = this.variant === 'summarized'
      ? this.#summarized(weapons)
      : this.#v3(ranged, melee, gear)
    this.element.innerHTML = `<header class="window-header"><h1>${esc(actor.name)} <small>(${this.variant}, viewing as ${esc(game.user.name)})</small></h1></header><section class="window-content">${html}</section>`

    // CoC7 global-sheet.js:446 binds these directly on the anchors
    this.element.querySelectorAll('.reload-weapon').forEach((a) => {
      a.addEventListener('click', (e) => this.#onReloadWeapon(e))
      a.addEventListener('contextmenu', (e) => this.#onReloadWeapon(e))
    })
    this.element.querySelectorAll('.weapon-name.rollable').forEach((n) => {
      n.addEventListener('click', (e) => this.rollCalls.push(e.currentTarget.closest('[data-item-uuid]').dataset.itemUuid))
    })
    this.rendered = true
    // A real CoC7 sheet fires one render hook per class in its chain, ActorSheetV2 included
    Hooks.callAll('renderCoC7ModelsActorCharacterSheetV2', this, this.element, {}, {})
    Hooks.callAll('renderActorSheetV2', this, this.element, {}, {})
    return this
  }

  close () {
    this.rendered = false
    this.element?.remove()
    this.element = null
    delete this.document.apps[this.id]
  }

  // Same behaviour as CoC7 _onReloadWeapon (global-sheet.js:964)
  async #onReloadWeapon (event) {
    event.preventDefault()
    const uuid = event.currentTarget.closest('.item').dataset.itemUuid
    const weapon = fromUuidSync(uuid)
    this.nativeCalls.push({ button: event.button, shift: event.shiftKey, weapon: weapon.name })
    const ammo = Number(weapon.system.ammo ?? 0)
    const max = Number(weapon.system.bullets ?? 0)
    if (event.button === 0) {
      await weapon.update({ 'system.ammo': event.shiftKey ? max : Math.min(ammo + 1, max) })
    } else if (event.button === 2) {
      if (event.shiftKey) await weapon.update({ 'system.ammo': 0 })
      else if (ammo >= 1) await weapon.update({ 'system.ammo': ammo - 1 })
    }
  }

  #v3 (ranged, melee, gear) {
    const row = (w) => `
      <li class="weapon-row item weapon" data-item-uuid="${w.uuid}">
        <div class="expand-arrow clickable"><i class="fa-solid fa-play"></i></div>
        <div class="item-image"></div>
        <div>
          <div class="weapon-name combat rollable">${esc(w.name)}</div>
        </div>
        <div class="weapon-range">
          <div class="weapon-damage"><a class="item-control">${esc(w.system.range?.normal?.damage ?? '1D10')}</a></div><div></div><div></div>
        </div>
        <div class="weapon-controls">
          <div class="ammo"><span class="tag">${w.system.ammo}</span></div>
          <div class="control"><a class="reload-weapon" data-tooltip="CoC7.Reload"><i class="fa-solid fa-gun"></i></a></div>
        </div>
        <div class="item-controls">
          <a class="item-control"><i class="fa-solid fa-edit"></i></a>
          <a class="item-control"><i class="fa-solid fa-trash"></i></a>
        </div>
      </li>`
    const meleeRow = (w) => `
      <li class="weapon-row item weapon" data-item-uuid="${w.uuid}">
        <div class="expand-arrow clickable"><i class="fa-solid fa-play"></i></div>
        <div class="item-image"></div>
        <div class="weapon-title"><div class="weapon-name combat rollable">${esc(w.name)}</div></div>
        <div class="weapon-range"><div class="weapon-damage"><a class="item-control">1D3</a></div></div>
        <div class="weapon-controls"></div>
        <div class="item-controls"><a class="item-control"><i class="fa-solid fa-edit"></i></a></div>
      </li>`
    return `
      <section class="tab combat">
        <section class="weapon-list melee"><header class="section-header"><h3>Melee Weapons</h3></header>
          <ul class="item-list">${melee.map(meleeRow).join('')}</ul></section>
        <section class="weapon-list range"><header class="section-header"><h3>Ranged Weapons</h3></header>
          <ul class="item-list">${ranged.map(row).join('')}</ul></section>
      </section>
      <section class="tab possessions">
        <h3>Gear</h3>
        <ul class="gear-list">${gear.map(i => `<li class="item flexrow" data-item-uuid="${i.uuid}"><span>${esc(i.name)}</span><span>×${i.system.quantity}</span></li>`).join('')}</ul>
      </section>`
  }

  #summarized (weapons) {
    return `
      <div class="weapons-block flexcol">
        ${weapons.map(w => `
          <div class="item flexrow" data-item-uuid="${w.uuid}">
            <div class="item-image"></div>
            <div class="weapon-name combat rollable flexrow"><div class="name">${esc(w.name)}</div></div>
            <div class="item-damage">1D10</div>
            <div class="item-controls">
              ${w.system.properties.rngd
                ? `<div class="ammo"><span class="tag">${w.system.ammo}</span></div><div class="control"><a class="reload-weapon" data-tooltip="CoC7.Reload"><i class="fa-solid fa-gun"></i></a></div>`
                : ''}
            </div>
          </div>`).join('')}
      </div>`
  }
}

// Ginzzzu's CoC7 Sheets 1.0 investigator sheet, from templates/investigator-sheet.hbs and
// scripts/sheets/investigator-sheet.js: only the active tab is drawn, reload/attack
// listeners are bound straight on the buttons in _onRender.
export class MockGinzzzuSheet {
  gciActiveTab = 'characteristics'

  constructor (actor, container = document.body) {
    this.document = actor
    this.container = container
    this.id = `gci-${actor.id}`
    this.rendered = false
    this.element = null
    this.nativeCalls = []
    this.attackCalls = []
  }

  get isEditable () { return this.document.isOwner }

  async render () {
    if (!this.element) {
      this.element = document.createElement('form')
      this.element.className = 'application coc7 sheet ginzzzu-coc7-sheets gci-window'
      this.container.append(this.element)
      this.document.apps[this.id] = this
    }
    const actor = this.document
    const tab = this.gciActiveTab
    const cards = actor.items.filter(i => i.type === 'weapon').map(w => {
      const hasAmmoTracker = !!w.system.properties?.rngd && w.system.bullets !== null
      return `
        <article class="gci-weapon-card item" data-item-uuid="${w.uuid}">
          <div class="gci-weapon-body">
            <div class="gci-weapon-title">${esc(w.name)}</div>
            <button class="gci-combat-action gci-combat-action--attack" type="button" data-action="gci-weapon-roll">Attack</button>
          </div>
          ${hasAmmoTracker ? `<div class="gci-ammo-block"><span>Ammo</span><strong>${w.system.ammo} / ${w.system.bullets}</strong>${this.isEditable ? '<button type="button" data-action="gci-reload-weapon" data-tooltip="CoC7.Reload"><i class="fa-solid fa-rotate"></i></button>' : ''}</div>` : ''}
        </article>`
    }).join('')
    const body = tab === 'combat'
      ? `<section class="gci-panel gci-combat-panel"><div class="gci-weapon-list">${cards}</div></section>`
      : `<section class="gci-panel"><p>${tab} tab</p></section>`
    this.element.innerHTML = `<header class="window-header"><h1>${esc(actor.name)} <small>(Ginzzzu sheet, ${tab}, viewing as ${esc(game.user.name)})</small></h1></header>
      <section class="window-content">
        <nav class="gci-tabs">${['characteristics', 'skills', 'combat'].map(t => `<button class="gci-tab${t === tab ? ' active' : ''}" type="button" data-action="gci-select-tab" data-tab="${t}">${t}</button>`).join('')}</nav>
        ${body}
      </section>`
    this.element.classList.add('character', 'gci-character-window')
    this.element.querySelectorAll('[data-action="gci-reload-weapon"]').forEach((b) => {
      b.addEventListener('click', (e) => this.#onReloadWeapon(e))
      b.addEventListener('contextmenu', (e) => this.#onReloadWeapon(e))
    })
    this.element.querySelectorAll('[data-action="gci-weapon-roll"]').forEach((b) => {
      b.addEventListener('click', (e) => this.attackCalls.push(e.currentTarget.closest('[data-item-uuid]').dataset.itemUuid))
    })
    this.element.querySelectorAll('[data-action="gci-select-tab"]').forEach((b) => {
      b.addEventListener('click', (e) => { this.gciActiveTab = e.currentTarget.dataset.tab; this.render() })
    })
    this.rendered = true
    Hooks.callAll('renderGinzzzuCoC7InvestigatorSheet', this, this.element, {}, {})
    Hooks.callAll('renderActorSheetV2', this, this.element, {}, {})
    return this
  }

  // Same as Ginzzzu's #onReloadWeapon (investigator-sheet.js:463)
  async #onReloadWeapon (event) {
    event.preventDefault()
    if (!this.isEditable) return
    const weapon = fromUuidSync(event.currentTarget.closest('[data-item-uuid]').dataset.itemUuid)
    if (!weapon || weapon.type !== 'weapon' || !weapon.system?.properties?.rngd) return
    this.nativeCalls.push({ button: event.button, shift: event.shiftKey, weapon: weapon.name })
    const ammo = Number(weapon.system.ammo ?? 0)
    const max = Number(weapon.system.bullets ?? 0)
    if (event.button === 2) {
      if (event.shiftKey) await weapon.update({ 'system.ammo': 0 })
      else if (ammo >= 1) await weapon.update({ 'system.ammo': ammo - 1 })
    } else {
      await weapon.update({ 'system.ammo': event.shiftKey ? max : Math.min(ammo + 1, max) })
    }
    await this.render()
  }

  close () {
    this.rendered = false
    this.element?.remove()
    this.element = null
    delete this.document.apps[this.id]
  }
}

// Any other actor sheet: no weapon markup the HUD knows
export class MockPlainSheet {
  constructor (actor, container = document.body) {
    this.document = actor
    this.container = container
    this.rendered = false
    this.element = null
  }

  async render () {
    if (!this.element) {
      this.element = document.createElement('div')
      this.element.className = 'application sheet actor'
      this.element.innerHTML = '<section class="window-content"><p>A sheet the HUD has never heard of</p></section>'
      this.container.append(this.element)
    }
    this.rendered = true
    return this
  }

  close () { this.rendered = false; this.element?.remove(); this.element = null }
}

export class MockItemSheet {
  constructor (item, container = document.body) {
    this.document = item
    this.container = container
    this.id = `item-sheet-${item.id}`
    this.rendered = false
    this.element = null
    this.formChanges = 0
  }

  get isEditable () { return this.document.isOwner }

  render () {
    if (!this.element) {
      this.element = document.createElement('form')
      this.element.className = 'application coc7 sheet dialog item'
      // ApplicationV2 submitOnChange listens for change on the form element
      this.element.addEventListener('change', () => { this.formChanges++ })
      this.container.append(this.element)
    }
    const item = this.document
    const inner = item.type === 'item'
      ? `<div class="flexrow item-header">
          <div class="flexcol item-property">
            <div class="flexrow"><input class="large" type="text" name="name" value="${esc(item.name)}"></div>
            <div class="flexrow">
              <div class="flexrow"><label>Quantity</label><input class="small" type="text" name="system.quantity" value="${item.system.quantity}"></div>
              <div class="flexrow"><label>Weight</label><input class="small" type="text" name="system.weight" value="0"></div>
              <div class="flexrow"><label>Price</label><input type="text" value="" placeholder="0" readonly></div>
            </div>
          </div>
          <img class="profile-img small" src="">
        </div>`
      : `<div class="flexrow item-header"><div class="flexcol item-property"><div class="flexrow"><input type="text" name="name" value="${esc(item.name)}"></div></div></div>
         <nav class="tabs"><a class="active">Details</a></nav>
         <section class="tab details flexcol scrollable active" data-group="primary" data-tab="details">
           <fieldset class="flexrow"><div class="columns flexrow">
             <div class="column-third flexrow"><label>Malfunction:</label><input class="small" type="text" name="system.malfunction" value="${item.system.malfunction ?? ''}"></div>
             <div class="column-third flexrow"><label>Magazine:</label><input class="small" type="text" name="system.bullets" value="${item.system.bullets ?? ''}"></div>
           </div></fieldset>
         </section>`
    this.element.innerHTML = `<header class="window-header"><h1>${esc(item.name)}</h1></header><section class="window-content">${inner}</section>`
    this.rendered = true
    Hooks.callAll('renderItemSheetV2', this, this.element, {}, {})
  }
}
