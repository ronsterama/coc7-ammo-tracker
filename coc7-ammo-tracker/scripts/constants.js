export const MODULE_ID = 'coc7-ammo-tracker'
export const SYSTEM_ID = 'CoC7'

export const LOADING = Object.freeze({
  LOOSE: 'loose',
  MAGAZINE: 'magazine'
})

/**
 * Operation options attached to every write this module makes, so our own
 * createItem / updateItem hooks can recognise and ignore them.
 * A fresh object each call: Foundry adds its own keys to the operation.
 * @returns {object}
 */
export function internalOptions () {
  return { [MODULE_ID]: { internal: true } }
}
