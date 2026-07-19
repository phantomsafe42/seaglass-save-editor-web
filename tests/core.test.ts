import assert from "node:assert/strict";
import fs from "node:fs";
import { SeaglassWebSave } from "../src/seaglass";

const savePath = "/Users/sorenfonnesbeck/Downloads/Pokemon Emerald SeaglassLHL.sav";
const currentSavePath = "/Users/sorenfonnesbeck/Game Stuff/ROMs/GBA/Pokemon Emerald Seaglass.sav";
const romPath = "/Users/sorenfonnesbeck/Game Stuff/ROMs/GBA/Pokemon Emerald Seaglass.gba";
const toArrayBuffer = (buffer: Buffer) => buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength) as ArrayBuffer;

const save = toArrayBuffer(fs.readFileSync(savePath));
const rom = toArrayBuffer(fs.readFileSync(romPath));
const editor = new SeaglassWebSave(save, rom);
const read16 = (bytes: Uint8Array, offset: number) => new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint16(offset, true);
const read32 = (bytes: Uint8Array, offset: number) => new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(offset, true);
const write16 = (bytes: Uint8Array, offset: number, value: number) => new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).setUint16(offset, value, true);
const boxedExperienceWord = (current: SeaglassWebSave, index: number) => {
  const raw = current.storage.slice(4 + index * 80, 4 + (index + 1) * 80);
  const decoded = (current as any).decodeMon(raw);
  return read32(decoded.dec, decoded.g + 4);
};
const pokemonWords = (current: SeaglassWebSave, location: { kind: "party" | "box"; index: number }) => {
  const raw = location.kind === "party"
    ? current.sb1.slice(0x0238 + location.index * 100, 0x0238 + (location.index + 1) * 100)
    : current.storage.slice(4 + location.index * 80, 4 + (location.index + 1) * 80);
  const decoded = (current as any).decodeMon(raw);
  return {
    iv: read32(decoded.dec, decoded.m + 4), ribbons: read32(decoded.dec, decoded.m + 8),
    moves: Array.from({ length: 4 }, (_, index) => read16(decoded.dec, decoded.a + index * 2)),
    ppBytes: Array.from(decoded.dec.subarray(decoded.a + 8, decoded.a + 12)),
  };
};
const pokemonExperience = (current: SeaglassWebSave, location: { kind: "party" | "box"; index: number }) => {
  const raw = location.kind === "party"
    ? current.sb1.slice(0x0238 + location.index * 100, 0x0238 + (location.index + 1) * 100)
    : current.storage.slice(4 + location.index * 80, 4 + (location.index + 1) * 80);
  const decoded = (current as any).decodeMon(raw);
  return read32(decoded.dec, decoded.g + 4) & 0x1fffff;
};
const pokemonPersonality = (current: SeaglassWebSave, location: { kind: "party" | "box"; index: number }) => {
  const raw = location.kind === "party"
    ? current.sb1.slice(0x0238 + location.index * 100, 0x0238 + (location.index + 1) * 100)
    : current.storage.slice(4 + location.index * 80, 4 + (location.index + 1) * 80);
  return read32(raw, 0);
};
const pokemonBallWord = (current: SeaglassWebSave, location: { kind: "party" | "box"; index: number }) => {
  const raw = location.kind === "party"
    ? current.sb1.slice(0x0238 + location.index * 100, 0x0238 + (location.index + 1) * 100)
    : current.storage.slice(4 + location.index * 80, 4 + (location.index + 1) * 80);
  const decoded = (current as any).decodeMon(raw);
  return read16(decoded.dec, decoded.g + 10);
};

assert.deepEqual(editor.verifyChecksums(), []);
assert.equal(editor.editableItems().filter(item => item.pocket === "balls").length, 27);
assert.equal(editor.pokemonSummary().length, 10);
assert.equal(editor.inventoryCatalog(2).length, 27);
assert.equal(editor.inventoryCatalog(3).length, 68, "TM/HM picker should contain TM01–TM60 and HM01–HM08 only");
assert.deepEqual(editor.inventoryCatalog(3).slice(0, 2), [{ id: 582, name: "Focus Punch" }, { id: 583, name: "Dragon Claw" }]);
assert.deepEqual(editor.inventoryCatalog(3).slice(-2), [{ id: 688, name: "Waterfall" }, { id: 689, name: "Dive" }]);
assert.equal(editor.machineNumber(582), "TM01");
assert.equal(editor.machineNumber(641), "TM60");
assert.equal(editor.machineNumber(682), "HM01");
assert.equal(editor.machineNumber(689), "HM08");
assert.equal(editor.machineType(582), "Fighting");
assert.equal(editor.machineType(583), "Dragon");
assert.equal(editor.machineType(584), "Water");
assert.equal(editor.machineType(638), "Fairy");
assert.equal(editor.machineType(682), "Normal");
assert.equal(editor.machineType(684), "Water");
assert.equal(editor.inventoryCatalog(4).length, 68);
assert.ok(editor.inventoryCatalog(1).some(item => item.name === "Potion"));
assert.ok(editor.inventoryCatalog(5).length > 0);
const potionSprite = editor.itemSpriteRgba(28);
assert.ok(potionSprite);
assert.deepEqual([potionSprite.width, potionSprite.height], [24, 24]);
assert.ok(potionSprite.pixels.some((value, index) => index % 4 === 3 && value > 0));
for (const ball of editor.inventoryCatalog(2)) {
  const ballSprite = editor.itemSpriteRgba(ball.id); assert.ok(ballSprite, ball.name);
  assert.deepEqual([ballSprite.width, ballSprite.height], [24, 24], `${ball.name} should use its cropped ROM dimensions`);
}
assert.equal(editor.itemSpriteRgba(582), null, "TM sprites are generated by the game and use the editor's TM fallback badge");

const inventoryEditor = new SeaglassWebSave(toArrayBuffer(fs.readFileSync(currentSavePath)), rom);
for (const pocket of [1, 2, 3, 4, 5] as const) assert.ok(inventoryEditor.bagPocketItems(pocket).length <= inventoryEditor.bagPocketCapacity(pocket));
assert.ok(inventoryEditor.pcItems().length <= inventoryEditor.pcItemCapacity());
const availableBagItem = inventoryEditor.inventoryCatalog(1).find(item => !inventoryEditor.bagPocketItems(1).some(entry => entry.id === item.id));
assert.ok(availableBagItem);
inventoryEditor.updateBagItem(null, availableBagItem.id, 99);
assert.equal(inventoryEditor.bagPocketItems(1).find(item => item.id === availableBagItem.id)?.quantity, 99);
inventoryEditor.updateBagItem(availableBagItem.id, availableBagItem.id, 42);
assert.equal(inventoryEditor.bagPocketItems(1).find(item => item.id === availableBagItem.id)?.quantity, 42);
inventoryEditor.updateBagItem(availableBagItem.id, availableBagItem.id, 0);
assert.equal(inventoryEditor.bagPocketItems(1).some(item => item.id === availableBagItem.id), false);
const availablePcBall = inventoryEditor.inventoryCatalog(2).find(item => !inventoryEditor.pcItems(2).some(entry => entry.id === item.id));
assert.ok(availablePcBall);
inventoryEditor.updatePcItem(null, availablePcBall.id, 99);
assert.equal(inventoryEditor.pcItems(2).find(item => item.id === availablePcBall.id)?.quantity, 99);
inventoryEditor.updatePcItem(availablePcBall.id, availablePcBall.id, 0);
assert.equal(inventoryEditor.pcItems(2).some(item => item.id === availablePcBall.id), false);
const pokeBall = inventoryEditor.inventoryCatalog(2).find(item => item.name === "Poké Ball");
assert.ok(pokeBall);
assert.equal(inventoryEditor.bagPocketItems(2).find(item => item.id === pokeBall.id)?.quantity, 103, "current save should preserve the in-game NPC reward above 99");
assert.equal(inventoryEditor.transferInventoryItem(pokeBall.id, "bag"), 103);
assert.equal(inventoryEditor.bagPocketItems(2).some(item => item.id === pokeBall.id), false);
assert.equal(inventoryEditor.pcItems(2).find(item => item.id === pokeBall.id)?.quantity, 103);
assert.equal(inventoryEditor.transferInventoryItem(pokeBall.id, "pc"), 103);
assert.equal(inventoryEditor.pcItems(2).some(item => item.id === pokeBall.id), false);
assert.equal(inventoryEditor.bagPocketItems(2).find(item => item.id === pokeBall.id)?.quantity, 103);
assert.deepEqual(inventoryEditor.verifyChecksums(), []);

const moves = editor.moveList();
assert.ok(moves.length > 500);
assert.deepEqual(moves.map(move => move.name), moves.map(move => move.name).toSorted((a, b) => a.localeCompare(b, "en", { sensitivity: "base" })));
assert.equal(editor.moveName(1), "Pound");
assert.equal(editor.movePp(1), 35);
assert.deepEqual([0, 1, 2, 3].map(ppUps => editor.moveMaxPp(1, ppUps)), [35, 42, 49, 56]);
assert.deepEqual(editor.speciesAbilities(255).map(ability => [ability.slot, ability.name, ability.hidden]), [
  [0, "Blaze", false], [1, "Defiant", false], [2, "Speed Boost", true],
]);
assert.deepEqual(editor.speciesAbilities(257).map(ability => [ability.slot, ability.name, ability.hidden]), [
  [0, "Blaze", false], [1, "Defiant", false], [2, "Athletic", true],
]);
assert.deepEqual(editor.speciesAbilities(183).map(ability => [ability.slot, ability.name, ability.hidden]), [
  [0, "Thick Fat", false], [1, "Huge Power", false], [2, "Sap Sipper", true],
]);
const torchicEvolution = editor.evolutionSummary({ species: 255, level: 15, nature: 0, gender: "M", heldItem: 0, friendship: 70, moves: [], ivs: [0,0,0,0,0,0], evs: [0,0,0,0,0,0], contest: [0,0,0,0,0] });
assert.deepEqual(torchicEvolution, { text: "Evolves at Lv. 16", canEvolve: false });
assert.deepEqual(editor.evolutionSummary({ species: 255, level: 16, nature: 0, gender: "M", heldItem: 0, friendship: 70, moves: [], ivs: [0,0,0,0,0,0], evs: [0,0,0,0,0,0], contest: [0,0,0,0,0] }), { text: "Evolves at Lv. 16", canEvolve: true });
const torchicNotYet = editor.evolutionOptions({ species: 255, level: 15, experience: editor.experienceBeforeLevel(255, 15) + 1, nature: 0, gender: "M", heldItem: 0, friendship: 70, moves: [], ivs: [0,0,0,0,0,0], evs: [0,0,0,0,0,0], contest: [0,0,0,0,0] })[0];
assert.equal(torchicNotYet.status, "unmet");
const torchicWill = editor.evolutionOptions({ species: 255, level: 15, experience: editor.experienceBeforeLevel(255, 16), nature: 0, gender: "M", heldItem: 0, friendship: 70, moves: [], ivs: [0,0,0,0,0,0], evs: [0,0,0,0,0,0], contest: [0,0,0,0,0] })[0];
assert.equal(torchicWill.status, "will");
assert.deepEqual(torchicWill.fulfillment, { kind: "level", level: 15, experience: editor.experienceBeforeLevel(255, 16) });
assert.equal(editor.experienceBeforeLevel(255, 16) - editor.experienceAtLevel(255, 15), editor.experienceAtLevel(255, 16) - editor.experienceAtLevel(255, 15) - 1);
assert.match(editor.evolutionSummary({ species: 126, level: 30, nature: 0, gender: "M", heldItem: 0, friendship: 70, moves: [], ivs: [0,0,0,0,0,0], evs: [0,0,0,0,0,0], contest: [0,0,0,0,0] }).text, /using Magmarizer/);
assert.match(editor.evolutionSummary({ species: 64, level: 16, nature: 0, gender: "M", heldItem: 0, friendship: 70, moves: [], ivs: [0,0,0,0,0,0], evs: [0,0,0,0,0,0], contest: [0,0,0,0,0] }).text, /using Linking Cord/);
const kadabraItem = editor.evolutionOptions({ species: 64, level: 16, nature: 0, gender: "M", heldItem: 0, friendship: 70, moves: [], ivs: [0,0,0,0,0,0], evs: [0,0,0,0,0,0], contest: [0,0,0,0,0] })[0];
assert.deepEqual(kadabraItem, { text: "Evolves using Linking Cord", choiceLabel: "Linking Cord", target: 65, method: 7, status: "unmet", fulfillment: { kind: "heldItem", item: 796 } });
const feebasRoutes = editor.evolutionOptions({ species: 349, level: 20, experience: 0, nature: 0, gender: "F", heldItem: 0, friendship: 70, moves: [], ivs: [0,0,0,0,0,0], evs: [0,0,0,0,0,0], contest: [0,0,0,0,0] });
assert.deepEqual(feebasRoutes.map(option => [option.choiceLabel, option.method, option.target]), [["Max Beauty", 15, 350], ["Prism Scale", 7, 350]]);
const magnetonRoutes = editor.evolutionOptions({ species: 82, level: 30, experience: 0, nature: 0, gender: "N", heldItem: 0, friendship: 70, moves: [], ivs: [0,0,0,0,0,0], evs: [0,0,0,0,0,0], contest: [0,0,0,0,0] });
assert.deepEqual(magnetonRoutes.map(option => option.choiceLabel), ["Thunder Stone"]);
const nincadaRoutes = editor.evolutionOptions({ species: 290, level: 19, experience: 0, nature: 0, gender: "M", heldItem: 0, friendship: 70, moves: [], ivs: [0,0,0,0,0,0], evs: [0,0,0,0,0,0], contest: [0,0,0,0,0] });
assert.deepEqual(nincadaRoutes.map(option => [option.method, option.target]), [[13, 291]]);
const golbatFriendship = editor.evolutionOptions({ species: 42, level: 30, experience: 0, nature: 0, gender: "M", heldItem: 0, friendship: 70, moves: [], ivs: [0,0,0,0,0,0], evs: [0,0,0,0,0,0], contest: [0,0,0,0,0] })[0];
assert.deepEqual(golbatFriendship.fulfillment, { kind: "friendship", value: 255, experience: editor.experienceBeforeLevel(42, 31) });
const bulbasaurMovepool = editor.speciesMovepool(1);
assert.ok(bulbasaurMovepool.has(33), "Bulbasaur ROM movepool should include Tackle");
assert.ok(!bulbasaurMovepool.has(1), "Bulbasaur ROM movepool should not include Pound");
const bulbasaurMoveGroups = editor.speciesMoveGroups(1);
assert.ok(bulbasaurMoveGroups.levelUp.has(33), "Tackle should be a Bulbasaur level-up move");
assert.ok(bulbasaurMoveGroups.machine.has(15), "Cut should be a Bulbasaur TM/HM move");
assert.ok(bulbasaurMoveGroups.tutor.has(34), "Body Slam should be a Bulbasaur tutor move");
assert.ok(bulbasaurMoveGroups.egg.has(130), "Skull Bash should be a Bulbasaur egg move");

const flaggedBox = editor.boxPokemon(1);
assert.ok(flaggedBox);
assert.equal(flaggedBox.level, 4);
const flaggedExperienceBefore = boxedExperienceWord(editor, 1);
assert.equal(flaggedExperienceBefore & 0x1fffff, 64);
assert.equal(flaggedExperienceBefore & 0xffe00000, 0x1fe00000);
editor.updatePokemon(flaggedBox.location, { ...flaggedBox, level: 5 });
const flaggedExperienceAfter = boxedExperienceWord(editor, 1);
assert.equal(flaggedExperienceAfter & 0x1fffff, 125);
assert.equal(flaggedExperienceAfter & 0xffe00000, flaggedExperienceBefore & 0xffe00000);
assert.equal(editor.boxPokemon(1)?.level, 5);
assert.deepEqual(editor.verifyChecksums(), []);

const currentEditor = new SeaglassWebSave(toArrayBuffer(fs.readFileSync(currentSavePath)), rom);
const currentBoxed = Array.from({ length: 420 }, (_, index) => currentEditor.boxPokemon(index)).filter(record => record);
assert.equal(currentBoxed.find(record => currentEditor.speciesName(record!.species) === "Sentret")?.level, 8);
assert.equal(currentBoxed.find(record => currentEditor.speciesName(record!.species) === "Zigzagoon")?.level, 8);
const torchic = currentEditor.partyPokemon().find(record => currentEditor.speciesName(record.species) === "Torchic");
assert.ok(torchic);
const torchicWordsBefore = pokemonWords(currentEditor, torchic.location);
assert.equal(torchic.abilitySlot, (torchicWordsBefore.ribbons >>> 29) & 3);
for (const abilitySlot of [0, 1, 2] as const) {
  const currentTorchic = currentEditor.partyPokemon().find(record => record.location.index === torchic.location.index);
  assert.ok(currentTorchic);
  currentEditor.updatePokemon(torchic.location, { ...currentTorchic, abilitySlot });
  assert.equal(currentEditor.partyPokemon().find(record => record.location.index === torchic.location.index)?.abilitySlot, abilitySlot);
  assert.equal((pokemonWords(currentEditor, torchic.location).ribbons >>> 29) & 3, abilitySlot, `ability slot ${abilitySlot} must use bits 29–30`);
}
const torchicWordsAfter = pokemonWords(currentEditor, torchic.location);
assert.equal(torchicWordsAfter.ribbons & 0x9fffffff, torchicWordsBefore.ribbons & 0x9fffffff, "changing abilities must preserve ribbons and the modern fateful encounter flag");
assert.equal(torchicWordsAfter.iv & 0xc0000000, torchicWordsBefore.iv & 0xc0000000);
assert.deepEqual(currentEditor.verifyChecksums(), []);
assert.equal(currentEditor.currentLevelCap(), 19);
const levelsBeforeCapFill = currentEditor.partyPokemon().map(record => record.level);
const capFill = currentEditor.raisePartyToLevelCap();
assert.deepEqual(capFill, { cap: 19, raised: levelsBeforeCapFill.filter(level => level < 19).length, unchanged: levelsBeforeCapFill.filter(level => level >= 19).length });
assert.deepEqual(currentEditor.partyPokemon().map(record => record.level), levelsBeforeCapFill.map(level => Math.max(level, 19)));
assert.equal(currentEditor.partyPokemon().find(record => currentEditor.speciesName(record.species) === "Torchic")?.abilitySlot, 2);
assert.deepEqual(currentEditor.verifyChecksums(), []);
const fulfilledTorchic = currentEditor.partyPokemon().find(record => currentEditor.speciesName(record.species) === "Torchic");
assert.ok(fulfilledTorchic);
const onePointBefore = currentEditor.experienceBeforeLevel(fulfilledTorchic.species, 16);
currentEditor.updatePokemon(fulfilledTorchic.location, { ...fulfilledTorchic, level: 15, experience: onePointBefore });
assert.equal(currentEditor.partyPokemon().find(record => record.location.index === fulfilledTorchic.location.index)?.level, 15);
assert.equal(pokemonExperience(currentEditor, fulfilledTorchic.location), onePointBefore);
const berryBefore = currentEditor.bagItemQuantity(514);
const itemFulfilledTorchic = currentEditor.partyPokemon().find(record => record.location.index === fulfilledTorchic.location.index)!;
currentEditor.updatePokemon(itemFulfilledTorchic.location, { ...itemFulfilledTorchic, heldItem: 796, returnedHeldItem: 514 });
assert.equal(currentEditor.bagItemQuantity(514), berryBefore + 1);
assert.equal(currentEditor.partyPokemon().find(record => record.location.index === fulfilledTorchic.location.index)?.heldItem, 796);
assert.deepEqual(currentEditor.verifyChecksums(), []);
assert.equal(currentEditor.addAllTms(), 60);
assert.equal(currentEditor.addAllBerries(), 68);
assert.equal(currentEditor.addAllZCrystals(), 35);
assert.equal(currentEditor.bagItemQuantity(582), 99);
assert.equal(currentEditor.bagItemQuantity(581), 99);
assert.equal(currentEditor.bagItemQuantity(391), 1);
assert.deepEqual(currentEditor.verifyChecksums(), []);

const berryBoundaryEditor = new SeaglassWebSave(toArrayBuffer(fs.readFileSync(currentSavePath)), rom), berryLogicalBefore = berryBoundaryEditor.sb1;
berryBoundaryEditor.addAllBerries();
const berryLogicalAfter = berryBoundaryEditor.sb1;
assert.deepEqual(berryLogicalAfter.slice(0, 0x8a8), berryLogicalBefore.slice(0, 0x8a8), "Berry fill must not alter data before the expanded Berry pocket");
assert.deepEqual(berryLogicalAfter.slice(0x9b8), berryLogicalBefore.slice(0x9b8), "Berry fill must not alter data after the expanded Berry pocket");
assert.deepEqual(berryBoundaryEditor.verifyChecksums(), []);

const roomEditor = new SeaglassWebSave(toArrayBuffer(fs.readFileSync(currentSavePath)), rom);
const roomParty = roomEditor.partyPokemon(), roomBoxCount = Array.from({ length: 420 }, (_, index) => roomEditor.boxPokemon(index)).filter(Boolean).length;
assert.equal(roomParty.length, 6);
const movedSpecies = roomParty[5].species;
const roomLocation = roomEditor.updatePokemon(roomParty[0].location, { ...roomParty[0], makePartyRoom: true });
assert.deepEqual(roomLocation, roomParty[0].location);
assert.equal(roomEditor.partyPokemon().length, 5);
assert.equal(Array.from({ length: 420 }, (_, index) => roomEditor.boxPokemon(index)).filter(Boolean).length, roomBoxCount + 1);
assert.ok(Array.from({ length: 420 }, (_, index) => roomEditor.boxPokemon(index)).some(record => record?.species === movedSpecies));
assert.deepEqual(roomEditor.verifyChecksums(), []);

const sixthSlotEditor = new SeaglassWebSave(toArrayBuffer(fs.readFileSync(currentSavePath)), rom);
const sixthSlotParty = sixthSlotEditor.partyPokemon(), fifthSpecies = sixthSlotParty[4].species, selectedSixthSpecies = sixthSlotParty[5].species;
const shiftedLocation = sixthSlotEditor.updatePokemon(sixthSlotParty[5].location, { ...sixthSlotParty[5], makePartyRoom: true });
assert.deepEqual(shiftedLocation, { kind: "party", index: 4 });
assert.equal(sixthSlotEditor.partyPokemon().length, 5);
assert.equal(sixthSlotEditor.partyPokemon()[4].species, selectedSixthSpecies);
assert.ok(Array.from({ length: 420 }, (_, index) => sixthSlotEditor.boxPokemon(index)).some(record => record?.species === fifthSpecies));
assert.deepEqual(sixthSlotEditor.verifyChecksums(), []);

const personalityEditor = new SeaglassWebSave(toArrayBuffer(fs.readFileSync(currentSavePath)), rom);
const personalityMon = personalityEditor.partyPokemon()[0];
personalityEditor.updatePokemon(personalityMon.location, { ...personalityMon, species: 265, nickname: "WURMPLE", level: 6, evolutionMethod: 11 });
assert.ok(((pokemonPersonality(personalityEditor, personalityMon.location) >>> 16) % 10) <= 4);
const silcoonReady = personalityEditor.partyPokemon()[0];
personalityEditor.updatePokemon(silcoonReady.location, { ...silcoonReady, evolutionMethod: 12 });
assert.ok(((pokemonPersonality(personalityEditor, silcoonReady.location) >>> 16) % 10) > 4);
assert.deepEqual(personalityEditor.verifyChecksums(), []);

const party = editor.partyPokemon();
assert.equal(party.length, 6);
const sharedRaw = editor.sb1.slice(0x238, 0x238 + 100), sharedDecoded = (editor as any).decodeMon(sharedRaw);
const originalFirstMove = read16(sharedDecoded.dec, sharedDecoded.a) & 0x7ff;
write16(sharedDecoded.dec, sharedDecoded.a, originalFirstMove | 0xf800);
sharedDecoded.dec[sharedDecoded.a + 8] |= 0x80;
(editor as any).writeSb1(0x238, (editor as any).encodeMon(sharedRaw, sharedDecoded));
const sharedRecord = editor.partyPokemon()[0];
assert.equal(sharedRecord.moves[0], originalFirstMove);
assert.equal(sharedRecord.pp[0] & 0x80, 0);
editor.updatePokemon(sharedRecord.location, { ...sharedRecord, ppUps: [3, 2, 1, 0], contest: [11, 22, 33, 44, 55], sheen: 66 });
const sharedWordsAfter = pokemonWords(editor, sharedRecord.location);
assert.equal(sharedWordsAfter.moves[0] & 0xf800, 0xf800);
assert.equal(sharedWordsAfter.ppBytes[0] & 0x80, 0x80);
assert.deepEqual(editor.partyPokemon()[0].ppUps, [3, 2, 1, 0]);
assert.deepEqual(editor.partyPokemon()[0].contest, [11, 22, 33, 44, 55]);
assert.equal(editor.partyPokemon()[0].sheen, 66);
const boundedContestRecord = editor.partyPokemon()[0];
editor.updatePokemon(boundedContestRecord.location, { ...boundedContestRecord, contest: [-1, 256, 999, 255.9, Number.NaN], sheen: 999 });
assert.deepEqual(editor.partyPokemon()[0].contest, [0, 255, 255, 255, 0]);
assert.equal(editor.partyPokemon()[0].sheen, 255);
const sprite = editor.spriteRgba(party[0].species, party[0].shiny);
assert.ok(sprite);
assert.deepEqual([sprite.width, sprite.height], [64, 64]);
assert.ok(sprite.pixels.some((value, index) => index % 4 === 3 && value > 0));
const backSprite = editor.spriteRgba(party[0].species, party[0].shiny, true), shinyBackSprite = editor.spriteRgba(party[0].species, !party[0].shiny, true);
assert.ok(backSprite);
assert.ok(shinyBackSprite);
assert.deepEqual([backSprite.width, backSprite.height], [64, 64]);
assert.ok(backSprite.pixels.some((value, index) => index % 4 === 3 && value > 0));
assert.ok(shinyBackSprite.pixels.some((value, index) => index % 4 === 3 && value > 0));

const originalPartyBallWord = pokemonBallWord(editor, party[0].location), changedBall = party[0].ball === 12 ? 1 : 12;
const editedParty = { ...party[0], nickname: "WEBEDIT", level: Math.min(100, party[0].level + 1), nature: (party[0].nature + 1) % 25, shiny: !party[0].shiny, ball: changedBall, ivs: [30, 29, 28, 27, 26, 25], evs: [1, 2, 3, 4, 5, 6] };
assert.throws(() => editor.updatePokemon(party[0].location, { ...editedParty, evs: [252, 252, 7, 0, 0, 0] }), /EV total cannot exceed 510/);
assert.deepEqual(editor.verifyChecksums(), []);
editor.updatePokemon(party[0].location, editedParty);
const partyAfter = editor.partyPokemon()[0];
assert.equal(partyAfter.nickname, "WEBEDIT");
assert.equal(partyAfter.level, editedParty.level);
assert.equal(partyAfter.nature, editedParty.nature);
assert.equal(partyAfter.shiny, editedParty.shiny, "party record should expose the newly selected sprite variant");
assert.equal(partyAfter.ball, changedBall);
assert.equal(pokemonBallWord(editor, party[0].location) & 0xffc0, originalPartyBallWord & 0xffc0, "changing the Ball must preserve adjacent Growth data");
assert.deepEqual(partyAfter.ivs, editedParty.ivs);
assert.deepEqual(partyAfter.evs, editedParty.evs);
assert.deepEqual(editor.verifyChecksums(), []);

const firstBox = editor.boxPokemon(0);
assert.ok(firstBox);
editor.updatePokemon(firstBox.location, { ...firstBox, nickname: "BOXEDIT", level: Math.min(100, firstBox.level + 1), shiny: !firstBox.shiny, friendship: 999, ivs: [99, 99, 99, 99, 99, 99] });
const boxAfter = editor.boxPokemon(0);
assert.ok(boxAfter);
assert.equal(boxAfter.nickname, "BOXEDIT");
assert.equal(boxAfter.level, Math.min(100, firstBox.level + 1));
assert.equal(boxAfter.shiny, !firstBox.shiny, "PC record should expose the newly selected sprite variant");
assert.equal(editor.boxSlots(0)[0].shiny, !firstBox.shiny, "PC slot should refresh to the newly selected sprite variant");
assert.equal(boxAfter.friendship, 255);
assert.deepEqual(boxAfter.ivs, [31, 31, 31, 31, 31, 31]);
assert.deepEqual(editor.verifyChecksums(), []);

const emptySlot = editor.boxSlots(0).find(slot => !slot.occupied);
assert.ok(emptySlot);
assert.throws(() => editor.addBoxPokemon(emptySlot.index, {
  species: 1, nickname: "TOOMANYEVS", level: 5, nature: 3,
  gender: "M", shiny: false, abilitySlot: 0, heldItem: 0,
  friendship: 999, moves: [1, 0, 0, 0], pp: [35, 0, 0, 0], ppUps: [0, 0, 0, 0],
  ivs: [99, 99, 99, 99, 99, 99], evs: [252, 252, 7, 0, 0, 0], contest: [0, 0, 0, 0, 0], sheen: 0,
}), /EV total cannot exceed 510/);
editor.addBoxPokemon(emptySlot.index, {
  species: 1, nickname: "BULBASAUR", level: 5, nature: 3,
  gender: "M", shiny: false, abilitySlot: 2, heldItem: 0,
  friendship: editor.baseFriendship(1), moves: [1, 0, 0, 0], pp: [56, 0, 0, 0], ppUps: [3, 0, 0, 0],
  ivs: [31, 31, 31, 31, 31, 31], evs: [0, 0, 0, 0, 0, 0], contest: [255, 200, 150, 100, 50], sheen: 25,
});
assert.equal(editor.boxSlots(0).find(slot => slot.index === emptySlot.index)?.name, "Bulbasaur");
assert.equal(editor.boxPokemon(emptySlot.index)?.abilitySlot, 2);
assert.equal(editor.boxPokemon(emptySlot.index)?.ball, 1, "newly added Pokémon should default to a Poké Ball");
assert.deepEqual(editor.boxPokemon(emptySlot.index)?.ppUps, [3, 0, 0, 0]);
assert.deepEqual(editor.boxPokemon(emptySlot.index)?.contest, [255, 200, 150, 100, 50]);
assert.equal(editor.boxPokemon(emptySlot.index)?.sheen, 25);
assert.equal((pokemonWords(editor, { kind: "box", index: emptySlot.index }).ribbons >>> 29) & 3, 2);
assert.equal(boxedExperienceWord(editor, emptySlot.index) & 0xffe00000, 0x1fe00000);
assert.deepEqual(editor.verifyChecksums(), []);
assert.throws(() => editor.addBoxPokemon(emptySlot.index, {
  species: 1, nickname: "SECOND", level: 5, nature: 0, gender: "M", shiny: false,
  abilitySlot: 0, heldItem: 0, friendship: 70, moves: [0,0,0,0], pp: [0,0,0,0], ppUps: [0,0,0,0],
  ivs: [0,0,0,0,0,0], evs: [0,0,0,0,0,0], contest: [0,0,0,0,0], sheen: 0,
}), /no longer empty/);

editor.applyEssentialsPreset();
assert.deepEqual(editor.verifyChecksums(), []);
const itemMap = new Map(editor.editableItems().map(item => [item.name, item]));
for (const name of ["Poké Ball", "Great Ball", "Ultra Ball", "Premier Ball", "Master Ball", "Quick Ball", "Full Restore", "Max Revive", "Nugget", "Rare Candy", "Max Elixir", "Max Repel"]) {
  const item = itemMap.get(name); assert.ok(item, name); assert.equal(editor.bagQuantity(item.id, item.pocket), 99, name);
}
for (const ball of editor.editableItems().filter(item => item.pocket === "balls" && !["Poké Ball", "Great Ball", "Ultra Ball", "Premier Ball", "Master Ball", "Quick Ball"].includes(item.name))) assert.equal(editor.pcQuantity(ball.id), 99, ball.name);

const tm61Before = editor.bagItemQuantity(642), hm01Before = editor.bagItemQuantity(682);
assert.equal(editor.addAllTms(), 60);
for (let id = 582; id <= 641; id++) assert.equal(editor.bagItemQuantity(id), 99, editor.itemName(id));
assert.equal(editor.bagItemQuantity(642), tm61Before, "TM61 expansion placeholder should remain unchanged");
assert.equal(editor.bagItemQuantity(682), hm01Before, "HM01 should remain unchanged");
assert.deepEqual(editor.verifyChecksums(), []);

assert.equal(editor.addAllBerries(), 68);
for (let id = 514; id <= 581; id++) assert.equal(editor.bagItemQuantity(id), 99, editor.itemName(id));
assert.deepEqual(editor.verifyChecksums(), []);

assert.equal(editor.addAllZCrystals(), 35);
for (let id = 357; id <= 391; id++) assert.equal(editor.bagItemQuantity(id), 1, editor.itemName(id));
assert.deepEqual(editor.verifyChecksums(), []);

const counts = editor.maxAllIvs();
assert.deepEqual(counts, { party: 6, boxed: 5 });
assert.deepEqual(editor.verifyChecksums(), []);
assert.equal(editor.data.length, new Uint8Array(save).length);
if (process.env.SEAGLASS_TEST_OUTPUT) fs.writeFileSync(process.env.SEAGLASS_TEST_OUTPUT, editor.data);

console.log("core regression passed", counts);
