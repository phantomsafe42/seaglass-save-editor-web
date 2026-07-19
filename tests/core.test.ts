import assert from "node:assert/strict";
import fs from "node:fs";
import { SeaglassWebSave } from "../src/seaglass";

const savePath = "/Users/sorenfonnesbeck/Downloads/Pokemon Emerald SeaglassLHL.sav";
const romPath = "/Users/sorenfonnesbeck/Game Stuff/ROMs/GBA/Pokemon Emerald Seaglass.gba";
const toArrayBuffer = (buffer: Buffer) => buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength) as ArrayBuffer;

const save = toArrayBuffer(fs.readFileSync(savePath));
const rom = toArrayBuffer(fs.readFileSync(romPath));
const editor = new SeaglassWebSave(save, rom);

assert.deepEqual(editor.verifyChecksums(), []);
assert.equal(editor.editableItems().filter(item => item.pocket === "balls").length, 27);
assert.equal(editor.pokemonSummary().length, 10);

const emptySlot = editor.boxSlots(0).find(slot => !slot.occupied);
assert.ok(emptySlot);
editor.addBoxPokemon(emptySlot.index, {
  species: 1, nickname: "BULBASAUR", level: 5, nature: 3,
  gender: "M", shiny: false, abilitySlot: 0, heldItem: 0,
  friendship: editor.baseFriendship(1), moves: [1, 0, 0, 0], pp: [35, 0, 0, 0],
  ivs: [31, 31, 31, 31, 31, 31], evs: [0, 0, 0, 0, 0, 0],
});
assert.equal(editor.boxSlots(0).find(slot => slot.index === emptySlot.index)?.name, "Bulbasaur");
assert.deepEqual(editor.verifyChecksums(), []);
assert.throws(() => editor.addBoxPokemon(emptySlot.index, {
  species: 1, nickname: "SECOND", level: 5, nature: 0, gender: "M", shiny: false,
  abilitySlot: 0, heldItem: 0, friendship: 70, moves: [0,0,0,0], pp: [0,0,0,0],
  ivs: [0,0,0,0,0,0], evs: [0,0,0,0,0,0],
}), /no longer empty/);

editor.applyEssentialsPreset();
assert.deepEqual(editor.verifyChecksums(), []);
const itemMap = new Map(editor.editableItems().map(item => [item.name, item]));
for (const name of ["Poké Ball", "Great Ball", "Ultra Ball", "Premier Ball", "Master Ball", "Quick Ball", "Full Restore", "Max Revive", "Nugget", "Rare Candy", "Max Elixir", "Max Repel"]) {
  const item = itemMap.get(name); assert.ok(item, name); assert.equal(editor.bagQuantity(item.id, item.pocket), 99, name);
}
for (const ball of editor.editableItems().filter(item => item.pocket === "balls" && !["Poké Ball", "Great Ball", "Ultra Ball", "Premier Ball", "Master Ball", "Quick Ball"].includes(item.name))) assert.equal(editor.pcQuantity(ball.id), 99, ball.name);

const counts = editor.maxAllIvs();
assert.deepEqual(counts, { party: 6, boxed: 5 });
assert.deepEqual(editor.verifyChecksums(), []);
assert.equal(editor.data.length, new Uint8Array(save).length);
if (process.env.SEAGLASS_TEST_OUTPUT) fs.writeFileSync(process.env.SEAGLASS_TEST_OUTPUT, editor.data);

console.log("core regression passed", counts);
