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

    // Object:
    //   key = effect UUID
    //   property = region UUID
    const oldMapping = JSON.parse(this.flags?.torgeternity?.emanations ?? "{}");
    let changed = false;

    // Which effects still exist on the token/actor?
    const emanations = {};
    for (const effect of this.actor.allApplicableEffects())
      if (effect.active && effect.system.emanation.radius)
        emanations[effect.uuid] = effect;

    for (const [effect, region] of Object.entries(oldMapping)) {
      const regionDoc = await fromUuidSync(region, { strict: false });
      if (!emanations[effect]) {
        // The region should no longer exist
        if (regionDoc) await regionDoc.delete();
        delete oldMapping[effect];
        changed = true;
      } else if (!regionDoc) {
        // Somehow the region got deleted without our mapping being updated, so update the mapping.
        delete oldMapping[effect];
        changed = true;
      } else if (regionDoc) {
        // Check for change of radius
        const newRadius = emanations[effect].system.emanation.radius / canvas.scene.grid.distance * this.parent.dimensions.distancePixels;
        const curRadius = regionDoc.shapes[0].radius;
        if (curRadius !== newRadius) {
          const shape = { ...regionDoc.shapes[0] };
          shape.radius = newRadius;
          await regionDoc.update({ shapes: [shape] });
        }
      }
    }

    // Create any regions which don't already exist
    for (const [uuid, effect] of Object.entries(emanations))
      if (!oldMapping[uuid]) {
        oldMapping[uuid] = await this.createTokenEmanation(effect);
        changed = true;
      }

    // Update mapping
    if (changed) await this.update({ 'flags.torgeternity.emanations': JSON.stringify(oldMapping) });
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

    return region.uuid;
  }
}