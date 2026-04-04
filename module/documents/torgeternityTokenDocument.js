export default class TorgEternityTokenDocument extends foundry.documents.TokenDocument {
  async _preCreate(data, options, user) {
    const allowed = await super._preCreate(data, options, user);
    if (allowed === false) return false;

    // change the generic threat token to match the cosm's one if it's set in the scene

    if (this.texture.src.includes('systems/torgeternity/images/characters/threat')) {
      const cosm = canvas.scene.cosm;
      // not cosmTypes, because that includes 'none'
      if (cosm && Object.hasOwn(CONFIG.torgeternity.cosmDecks, cosm))
        this.updateSource({ 'texture.src': 'systems/torgeternity/images/characters/threat-' + cosm + '.Token.webp' });
    }
  }

  _onCreate(data, options, userId) {
    super._onCreate(data, options, userId);
    if (game.user.id !== userId) return;

    if (game.release.generation > 13) this.updateEffectRegions();
  }

  updateEffectRegions = foundry.utils.debounce(this.#updateEffectRegions.bind(this), 100);

  async #updateEffectRegions() {
    console.log('updateEffectRegions');

    const emanations = new Map();
    for (const effect of this.actor.allApplicableEffects())
      if (effect.active && effect.system.emanation.radius)
        emanations.set(effect.uuid, effect);

    // Remove any existing regions which should not be there.
    for (const region of this.attachments.regions) {
      for (const behavior of region.behaviors) {
        if (behavior.type !== 'torgApplyEffect') continue;
        let found = false;
        for (const uuid of behavior.system.effects)
          if (emanations.has(uuid)) {
            emanations.delete(uuid);
            found = true;
            break;
          }
        if (!found) {
          await region.delete();
          break;
        }
      }
    }
    // Add any new effects.
    for (const effect of emanations.values())
      await this.createTokenEmanation(effect);
  }

  /**
   * Foundry V14
   */
  async createTokenEmanation(effect) {
    const emanation = effect.system.emanation;

    const region = await CONFIG.Region.documentClass.createTokenEmanation(
      this,
      emanation.radius / canvas.scene.grid.distance,
      { // RegionData
        name: `${effect.name} (${this.name})`,
        restriction: { enabled: true },
        color: emanation.colour,
        // opacity: emanation.opacity,   // no support for opacity yet?
        displayMeasurements: true,
        visibility: CONST.REGION_VISIBILITY.OBSERVER,
        ownership: { [game.user.id]: CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER }
      },
      { gridBased: true })

    if (!region) return console.error('failed to create region document');

    const behavior = await CONFIG.RegionBehavior.documentClass.create(
      {
        name: this.name,
        type: 'torgApplyEffect',
        // Core doesn't support choosing one disposition over another
        system: {
          effects: [effect.uuid],
          disposition: emanation.disposition
        }
      },
      { parent: region });
  }
}