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

editor.applyEssentialsPreset();
assert.deepEqual(editor.verifyChecksums(), []);
const itemMap = new Map(editor.editableItems().map(item => [item.name, item]));
for (const name of ["Poké Ball", "Great Ball", "Ultra Ball", "Premier Ball", "Master Ball", "Quick Ball", "Full Restore", "Max Revive", "Nugget", "Rare Candy", "Max Elixir", "Max Repel"]) {
  const item = itemMap.get(name); assert.ok(item, name); assert.equal(editor.bagQuantity(item.id, item.pocket), 99, name);
}
for (const ball of editor.editableItems().filter(item => item.pocket === "balls" && !["Poké Ball", "Great Ball", "Ultra Ball", "Premier Ball", "Master Ball", "Quick Ball"].includes(item.name))) assert.equal(editor.pcQuantity(ball.id), 99, ball.name);

const counts = editor.maxAllIvs();
assert.deepEqual(counts, { party: 6, boxed: 4 });
assert.deepEqual(editor.verifyChecksums(), []);
assert.equal(editor.data.length, new Uint8Array(save).length);

console.log("core regression passed", counts);
