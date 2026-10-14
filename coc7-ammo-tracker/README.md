# CoC7 Ammo Tracker

A Foundry VTT module for the **Call of Cthulhu 7th Edition (CoC7)** system.
Reloading a firearm takes rounds out of an ammunition item in the investigator's Gear, and only from ammunition of that firearm's calibre.
The reload time from the rules (RAW) is shown as a notification.

- **Foundry VTT:** v13 minimum, built against v14 (stable 14.368)
- **CoC7 system:** 8.3 or later, built against 8.15. The weapon fields, sheet templates and reload handler this module uses are identical in 8.3 and 8.15.
- **No build step.** These are plain ES modules.

---

## Install (Molten Hosting: FTP upload, then manifest URL)

1. Connect to your Molten instance over FTP/SFTP.
2. Upload the whole `coc7-ammo-tracker` folder into `Data/modules/`. The result should be `Data/modules/coc7-ammo-tracker/module.json`.
   - The folder contains its own `coc7-ammo-tracker.zip`. Keep it: it is the `download` file the manifest points at.
   - If you start from the outer zip, extract it first. It already contains that folder.
3. Return to **Setup**. Open **Add-on Modules → Install Module**, paste this manifest URL and click **Install**:

   `https://planes-of-peril.moltenhosting.com/modules/coc7-ammo-tracker/module.json`

   Foundry serves that URL itself from the folder you just uploaded. It then downloads the zip next to it and registers the module, with no server restart.
4. Launch your CoC7 world. Open **Game Settings → Manage Modules**, enable **CoC7 Ammo Tracker** and save.

Don't use a `planes-of-peril.files.moltenhosting.com/files/…` address as the manifest URL. That is Molten's File Browser, and it returns a login page instead of the JSON.

If **Install Module** fails, restart the server from the Molten dashboard instead. Foundry also picks up uploaded module folders on start-up.

To update:

1. Bump `version` in `module.json`.
2. Run `package.ps1` from the project folder. It rebuilds both zips.
3. Upload the folder again over FTP and repeat step 3.
4. Everyone reloads the page (F5).

---

## Tag a weapon

The weapon must be a **firearm**. CoC7 has no firearm flag, so this module counts a weapon as a firearm when:

- it is **Ranged** (not Melee) and not **Thrown**, and
- it has a **Magazine** size greater than 0.

Thrown rocks, spears and whips are ranged in CoC7 but have no magazine, so they are ignored.

1. Open the weapon sheet and go to the **Details** tab.
2. Set **Magazine** to the capacity if it isn't already set (e.g. 6 for a revolver).
3. In the **Ammunition** box at the bottom:
   - **Calibre**: e.g. `.38 Special`, `12-gauge`, `.45 ACP`.
   - **Loading**:
     - **Loose rounds** (the default) for revolvers, shotguns and bolt-action rifles.
     - **Magazine / speedloader** for automatics, SMGs, or anything you reload in one go.

Only the GM or the weapon's owner can edit these fields.

## Tag an ammunition item

1. In the investigator's Gear, create a normal **Item**, e.g. "Box of .38 Special cartridges".
2. Set **Quantity** to the number of rounds.
3. Under Quantity, tick **Is ammunition** and type the **Calibre**.

Calibres match ignoring case and extra spaces, so `.38 special` matches `.38 Special`.
Weapons link to ammunition by calibre text, not by item ID. Newly looted ammunition therefore works immediately.

**Stacks merge automatically.** Suppose a second ammunition item of a calibre the actor already carries is dropped on, created on, or edited onto the actor. Its quantity is then added to the existing stack, and the new item is deleted.

**Empty stacks stay in Gear at 0** and are never deleted, so the calibre tag survives until you restock.

---

## Reloading

Each firearm row on the CoC7 character sheet shows a compact control:

    ⟳ 4/6 · 18      (loaded / capacity · rounds of that calibre in Gear)

It works on the V2 and V3 investigator sheets and on both summarized sheets.

- **Click it** to fill the gun as far as your reserve allows.
- **Greyed out** means one of two things:
  - no calibre is set on the weapon (tooltip: *Set a calibre on this weapon*), or
  - there is no ammunition of that calibre left.

  Clicking a greyed-out control tells you which.
- **Who sees it:** only users with **Owner** permission on the actor.

CoC7's own reload icon (next to the loaded count) changes behaviour:

| Click | Before (CoC7) | With this module |
|---|---|---|
| Left-click | +1 round, free | Reload from Gear (same as the ⟳ control) |
| Shift + left-click | Fill the gun, free | Reload from Gear |
| Right-click | −1 round | Unchanged |
| Shift + right-click | Empty the gun | Unchanged |

Firing is not changed. CoC7's ranged combat card still removes rounds from the gun when you shoot.

### Ginzzzu's CoC7 Sheets (optional)

If investigators use **Ginzzzu's CoC7 Sheets** (`ginzzzu-coc7-sheets`), the tracker works on that sheet's Combat tab as well:

- Each gun's **AMMO 4 / 6** box gains a second line, **Gear: 18**: the rounds of that calibre in Gear. It reads **No calibre** if the weapon isn't tagged.
- The sheet's own ⟳ button follows the same table as CoC7's icon above. Left-click and Shift + left-click reload from Gear; right-click and Shift + right-click are unchanged.
- The ⟳ button is greyed out when there's no calibre or no ammo.

Nothing extra is needed: without that module installed, this part simply never runs. NPC and creature sheets, Ginzzzu's or CoC7's, are left alone.

#### Double ammo use with Ginzzzu 1.0 (fixed here)

Ginzzzu's CoC7 Sheets 1.0 spends rounds twice on any attack started from its **Attack** button in **Multiple shots** or **Full auto** mode. That includes attacks through the Combat HUD, which presses the same button.

| Example | Should leave | Actually leaves |
|---|---|---|
| Revolver at 6, three shots | 3 | 0 |
| Thompson at 20, 10 rounds of full auto | 10 | 0 |

The cause:

- CoC7's ranged card counts each shot as it is added ("Shoot ‹target›"), but only takes the rounds out when the card is rolled ("Shoot !!!").
- Ginzzzu's ammo bookkeeping (`services/ammo-consumption.js`) lowers the gun on every added shot, assuming CoC7 had already spent them. CoC7 then spends them again.
- The card also shows **Out of ammo** at half the magazine. For example, a double-barrelled shotgun fires one barrel and loses both shells.

Single shots and single bursts aren't affected, and neither are attacks from CoC7's own sheets.

The world setting **Fix double ammo use with Ginzzzu's CoC7 Sheets** is on by default. It switches off just those three Ginzzzu chat-card hooks on every client; CoC7 still spends the rounds you actually fire. Turn it off only once Ginzzzu fixes this upstream. `dev-harness/ginzzzu-double-spend.mjs` in the project re-checks a given Ginzzzu version.

### The RAW reload rule used

- `toLoad = min(capacity − loaded, reserve)`. The gun gets `loaded + toLoad` and the ammunition item gets `reserve − toLoad`. Both are written in one `updateEmbeddedDocuments` call.
- **Loose rounds:** two cartridges per combat round, so `ceil(toLoad / 2)` combat rounds.
- **Magazine:** 1 combat round, whatever the count.

Example notification:

> Revolver (.38 Special) loaded 4 rounds — 2 combat rounds (RAW). Reserve: 18.

If the reserve can't fill the gun, it loads what there is and says it was a partial load.
There is no unload function.

---

## Macro / module API

```js
const api = game.modules.get('coc7-ammo-tracker').api

// Reload. The actor can be an Actor, Token, actor id or UUID.
// The weapon can be an Item, id or UUID.
const result = await api.reload(actor, weaponId)          // add { notify: false } to suppress the toast
// result.status is one of:
//   'loaded' | 'partial' | 'full' | 'noAmmo' | 'noCalibre' | 'notFirearm' | 'noPermission' | 'notFound' | 'busy'
// The result also carries: calibre, capacity, loaded, reserve, toLoad, combatRounds

// Rounds of a calibre the actor carries
api.getReserve(actor, '.38 Special')                     // → 18
```

Example macro that reloads the first tagged firearm of the selected token:

```js
const actor = canvas.tokens.controlled[0]?.actor
const gun = actor?.items.find(i => i.type === 'weapon' && i.flags['coc7-ammo-tracker']?.calibre)
if (gun) game.modules.get('coc7-ammo-tracker').api.reload(actor, gun.id)
```

Stored data: everything is in module flags.

| Document | Flag | Values |
|---|---|---|
| Weapon | `flags.coc7-ammo-tracker.calibre` | text |
| Weapon | `flags.coc7-ammo-tracker.loading` | `loose` or `magazine` |
| Ammunition item | `flags.coc7-ammo-tracker.isAmmo` | `true` |
| Ammunition item | `flags.coc7-ammo-tracker.calibre` | text |

## Settings

- **Debug logging** (world): writes diagnostics to the browser console (F12). Nothing is logged while it is off.

---

## Known limits

- **NPC sheets** keep their free +1 / fill reload (CoC7's and Ginzzzu's Keeper sheet). Only investigator sheets are changed: CoC7's V2, V3 and summarized sheets, and Ginzzzu's investigator sheet.
- **Other replacement character sheets** aren't covered. Reloading through the API or a macro still works with them.
- **Some CoC7 flows hand out a full gun.** When CoC7 *creates* a weapon for you, it fills it to capacity. This happens when a roll or link adds a weapon the actor didn't have (`getItemOrAdd`, `getItemAdding`, `weaponCheck`). Dragging a weapon onto the sheet does not fill it.
- **Owners can edit numbers by hand.** They can still change an ammunition item's Quantity or a weapon's Magazine size. This is a bookkeeping aid, not anti-cheat.
- **CoC7's "Disregard Ammo count" setting** lets guns fire with 0 rounds. The tracker still only reloads what is in Gear.
- **Layout is not version-proof.** The control is placed using the CoC7 8.15 sheet layout. A later CoC7 sheet redesign may need an update.

---

## Manual test checklist

Run these in a CoC7 world with the module enabled. "Investigator" is a player-owned character.

1. **Basic reload**
   - Make a **.38 Revolver**: Ranged, Magazine 6, Calibre `.38 Special`, Loading *Loose*. Set its loaded rounds to 0 (Shift + right-click CoC7's icon).
   - Give the investigator an Item with Quantity 20, *Is ammunition*, Calibre `.38 Special`.
   - Click ⟳. The row reads **6/6 · 14**, and the toast says **"… loaded 6 rounds — 3 combat rounds (RAW). Reserve: 14."**
2. **Reload after firing**
   - Fire 2 rounds through the normal CoC7 attack / ranged combat card. The row reads **4/6 · 14**.
   - Click ⟳. The row reads **6/6 · 12**, and the toast says **"1 combat round"**.
3. **Calibres stay separate**
   - Add a **12-gauge** shotgun (Calibre `12-gauge`, no 12-gauge ammunition in Gear).
   - Its control is greyed out. Clicking it says **"No 12-gauge ammunition."**, and the .38 reserve stays at 12.
4. **Stacks merge**
   - Drop a second .38 ammunition item (e.g. Quantity 10, calibre typed `.38 special`) onto the actor.
   - You get one stack, Quantity 22, and a "Merged …" toast.
   - Also try ticking *Is ammunition* on a plain item that already has the calibre. It should merge the same way.
5. **Partial load**
   - Set the .38 stack to 3 and the gun to 0/6, then reload.
   - The row reads **3/6 · 0**, the toast says *Partial load*, and the ammunition item is **still in Gear at 0**.
6. **No calibre**
   - Clear a weapon's Calibre. Its ⟳ is greyed out with the tooltip **"Set a calibre on this weapon"**.
7. **Player client**
   - Log in as the owning player and reload. It works.
   - On the GM's client the sheet shows the same numbers without a refresh.
   - Dropping ammunition as the player still merges.
8. **CoC7's icon no longer refills for free**
   - On the character sheet, left-click and Shift + left-click CoC7's own reload icon.
   - Each draws from Gear, giving the same toast as ⟳. With no matching ammunition, nothing is loaded.
   - Right-click still removes one round.
9. **Magazine loading**
   - Set a weapon's Loading to *Magazine* and reload 7 rounds. The toast says **"1 combat round"**.
10. **No console errors**
    - Open F12 while doing the above. There should be no errors from `coc7-ammo-tracker`.
    - With *Debug logging* on, `coc7-ammo-tracker |` lines appear.
