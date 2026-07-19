const SECTION_SIZE = 0x1000;
const DATA_SIZE = 0xf80;
const FOOTER = 0xff4;
const SIGNATURE = 0x08012025;
const SLOT_BASES = [0, 0xe000];
const SB1_IDS = [1, 2, 3, 4];
const STORAGE_IDS = [5, 6, 7, 8, 9, 10, 11, 12, 13];
const PARTY_COUNT_OFF = 0x234;
const PARTY_OFF = 0x238;
const PC_ITEMS_OFF = 0x498;
const BAG_ITEMS_OFF = 0x560;
const BAG_BALLS_OFF = 0x740;
const KEY_OFF = 0xac;
const ITEM_BASE = 0x67e77c;
const ITEM_STRIDE = 0x54;
const SPECIES_NAME_1 = 0x8f087c;
const SPECIES_STRIDE = 0xd0;
const MOVE_PTR_1 = 0x6d2a18;
const MOVE_STRIDE = 0x38;
const ABILITY_BASE = 0x6e15b0;
const ABILITY_STRIDE = 0x1c;
const SUBSTRUCT_ORDER = ["GAEM","GAME","GEAM","GEMA","GMAE","GMEA","AGEM","AGME","AEGM","AEMG","AMGE","AMEG","EGAM","EGMA","EAGM","EAMG","EMGA","EMAG","MGAE","MGEA","MAGE","MAEG","MEGA","MEAG"];
const STAT_KEYS = ["hp", "atk", "def", "spe", "spa", "spd"];
const NATURE_MOD = Array.from({ length: 25 }, (_, n) => [Math.floor(n / 5), n % 5]);

const CHARS = new Map<number, string>([[0," "],[0xae,"-"],[0xad,"."],[0xba,"/"],[0xab,"!"],[0xac,"?"],[0xb4,"'"],[0x1b,"é"]]);
for (let i = 0; i < 10; i++) CHARS.set(0xa1 + i, String(i));
for (let i = 0; i < 26; i++) { CHARS.set(0xbb + i, String.fromCharCode(65 + i)); CHARS.set(0xd5 + i, String.fromCharCode(97 + i)); }
const REVERSE_CHARS = new Map(Array.from(CHARS.entries()).map(([key, value]) => [value, key]));

const u16 = (b: Uint8Array, o: number) => new DataView(b.buffer, b.byteOffset, b.byteLength).getUint16(o, true);
const u32 = (b: Uint8Array, o: number) => new DataView(b.buffer, b.byteOffset, b.byteLength).getUint32(o, true);
const set16 = (b: Uint8Array, o: number, v: number) => new DataView(b.buffer, b.byteOffset, b.byteLength).setUint16(o, v, true);
const set32 = (b: Uint8Array, o: number, v: number) => new DataView(b.buffer, b.byteOffset, b.byteLength).setUint32(o, v >>> 0, true);

function decodeString(bytes: Uint8Array) {
  let result = "";
  for (const value of bytes) { if (value === 0xff) break; result += CHARS.get(value) ?? ""; }
  return result.trimEnd();
}

function encodeString(text: string, length: number) {
  const out = new Uint8Array(length).fill(0xff); let index = 0;
  for (const char of text.slice(0, length)) { out[index++] = REVERSE_CHARS.get(char) ?? 0; }
  return out;
}

function expAt(group: number, level: number) {
  if (level <= 1) return 0; const cube = level ** 3;
  if (group === 0) return cube;
  if (group === 4) return Math.floor(4 * cube / 5);
  if (group === 5) return Math.floor(5 * cube / 4);
  if (group === 3) return Math.max(0, Math.floor(6 * cube / 5) - 15 * level ** 2 + 100 * level - 140);
  if (group === 1) { if (level <= 50) return Math.floor(cube * (100 - level) / 50); if (level <= 68) return Math.floor(cube * (150 - level) / 100); if (level <= 98) return Math.floor(cube * Math.floor((1911 - 10 * level) / 3) / 500); return Math.floor(cube * (160 - level) / 100); }
  if (group === 2) { if (level <= 15) return Math.floor(cube * (Math.floor((level + 1) / 3) + 24) / 50); if (level <= 36) return Math.floor(cube * (level + 14) / 50); return Math.floor(cube * (Math.floor(level / 2) + 32) / 50); }
  return cube;
}

function checksum(block: Uint8Array) {
  let total = 0;
  for (let i = 0; i < block.length; i += 4) total = (total + u32(block, i)) >>> 0;
  return (((total >>> 16) + (total & 0xffff)) & 0xffff) >>> 0;
}

export type Pocket = "items" | "balls";
export type EditableItem = { id: number; name: string; pocket: Pocket };
export type NewPokemon = {
  species: number; nickname: string; level: number; nature: number;
  gender: "M" | "F" | "N"; shiny: boolean; abilitySlot: 0 | 1;
  heldItem: number; friendship: number; moves: number[]; pp: number[];
  ivs: number[]; evs: number[];
};
export type PokemonLocation = { kind: "party"; index: number } | { kind: "box"; index: number };
export type PokemonRecord = NewPokemon & {
  location: PokemonLocation; otName: string; isEgg: boolean;
};
export type SpriteData = { width: number; height: number; pixels: Uint8ClampedArray };

export class SeaglassWebSave {
  data: Uint8Array;
  rom: Uint8Array;
  sections = new Map<number, number>();
  activeSlot = -1;
  saveCounter = -1;
  private spriteCache = new Map<string, SpriteData | null>();

  constructor(save: ArrayBuffer, rom: ArrayBuffer) {
    this.data = new Uint8Array(save.slice(0));
    this.rom = new Uint8Array(rom.slice(0));
    if (this.data.length < 0x20000) throw new Error("Save is smaller than a 128 KB Emerald save.");
    if (this.rom.length < 0x900000 || !this.itemName(1).startsWith("Pok")) throw new Error("This does not look like the supported Emerald Seaglass ROM.");
    this.loadSlots();
  }

  private loadSlots() {
    let best: { counter: number; slot: number; sections: Map<number, number> } | null = null;
    for (const [slot, base] of SLOT_BASES.entries()) {
      const sections = new Map<number, number>(); let counter = -1;
      for (let physical = 0; physical < 14; physical++) {
        const off = base + physical * SECTION_SIZE;
        if (u32(this.data, off + FOOTER + 4) !== SIGNATURE) continue;
        const id = u16(this.data, off + FOOTER);
        sections.set(id, off); counter = Math.max(counter, u32(this.data, off + FOOTER + 8));
      }
      if (sections.size && (!best || counter > best.counter)) best = { counter, slot, sections };
    }
    if (!best || best.sections.size !== 14) throw new Error("No complete Emerald save slot was found.");
    this.sections = best.sections; this.activeSlot = best.slot; this.saveCounter = best.counter;
  }

  private reassemble(ids: number[]) {
    const out = new Uint8Array(ids.length * DATA_SIZE);
    ids.forEach((id, index) => { const off = this.sections.get(id); if (off == null) throw new Error(`Missing save section ${id}.`); out.set(this.data.subarray(off, off + DATA_SIZE), index * DATA_SIZE); });
    return out;
  }
  get sb1() { return this.reassemble(SB1_IDS); }
  get storage() { return this.reassemble(STORAGE_IDS); }

  verifyChecksums() {
    const bad: number[] = [];
    this.sections.forEach((off, id) => { if (u16(this.data, off + FOOTER + 2) !== checksum(this.data.subarray(off, off + DATA_SIZE))) bad.push(id); });
    return bad.sort((a, b) => a - b);
  }
  private fixSection(id: number) { const off = this.sections.get(id)!; set16(this.data, off + FOOTER + 2, checksum(this.data.subarray(off, off + DATA_SIZE))); }
  private writeLogical(ids: number[], offset: number, payload: Uint8Array) {
    const touched = new Set<number>();
    payload.forEach((byte, index) => { const logical = offset + index; const segment = Math.floor(logical / DATA_SIZE); const id = ids[segment]; const off = this.sections.get(id); if (off == null) throw new Error(`Missing save section ${id}.`); this.data[off + logical % DATA_SIZE] = byte; touched.add(id); });
    touched.forEach(id => this.fixSection(id));
  }
  private writeSb1(offset: number, payload: Uint8Array) { this.writeLogical(SB1_IDS, offset, payload); }
  private writeStorage(offset: number, payload: Uint8Array) { this.writeLogical(STORAGE_IDS, offset, payload); }

  itemName(id: number) { if (!id) return "(none)"; return decodeString(this.rom.subarray(ITEM_BASE + id * ITEM_STRIDE, ITEM_BASE + id * ITEM_STRIDE + 14)) || `item${id}`; }
  itemPocket(id: number) { return this.rom[ITEM_BASE + id * ITEM_STRIDE + 0x2d]; }
  speciesName(id: number) { if (!id) return "Empty"; const off = SPECIES_NAME_1 + (id - 1) * SPECIES_STRIDE; return decodeString(this.rom.subarray(off, off + 12)) || `#${id}`; }
  baseStats(id: number) { const off = SPECIES_NAME_1 + (id - 1) * SPECIES_STRIDE - 0x2c; return Array.from(this.rom.subarray(off, off + 6)); }
  genderRatio(id: number) { return this.rom[SPECIES_NAME_1 + (id - 1) * SPECIES_STRIDE - 0x2c + 0x12]; }
  baseFriendship(id: number) { return this.rom[SPECIES_NAME_1 + (id - 1) * SPECIES_STRIDE - 0x2c + 0x14]; }
  growthRate(id: number) { return this.rom[SPECIES_NAME_1 + (id - 1) * SPECIES_STRIDE - 0x2c + 0x15]; }
  abilityName(id: number) { if (!id) return "(none)"; return decodeString(this.rom.subarray(ABILITY_BASE + id * ABILITY_STRIDE, ABILITY_BASE + id * ABILITY_STRIDE + 13)) || `Ability ${id}`; }
  speciesAbilities(id: number) { const off = SPECIES_NAME_1 + (id - 1) * SPECIES_STRIDE - 0x2c + 0x18; const first = u16(this.rom, off), second = u16(this.rom, off + 2); return [{ slot: 0 as const, id: first, name: this.abilityName(first) }, ...(second && second !== first ? [{ slot: 1 as const, id: second, name: this.abilityName(second) }] : [])]; }
  moveName(id: number) { if (!id) return "—"; const ptr = u32(this.rom, MOVE_PTR_1 + (id - 1) * MOVE_STRIDE); if (ptr < 0x08000000 || ptr >= 0x0a000000) return `Move ${id}`; return decodeString(this.rom.subarray(ptr - 0x08000000, ptr - 0x08000000 + 16)) || `Move ${id}`; }
  moveList() { const result = [{ id: 0, name: "—" }]; for (let id = 1; id < 1000; id++) { const name = this.moveName(id); if (!name.startsWith("Move ") && /[A-Za-z0-9]/.test(name)) result.push({ id, name }); } return result; }
  speciesList() {
    const result: { id: number; name: string }[] = [];
    for (let id = 1; id < 1300; id++) {
      const name = this.speciesName(id).trim(), letters = name.replace(/[^A-Za-z]/g, "");
      if (name.length >= 3 && /^[A-Z]/.test(name) && /^[A-Za-z0-9 .':é♀♂-]+$/.test(name) && /[aeiouyé]/i.test(name) && new Set(letters.toLowerCase()).size > 1) result.push({ id, name });
    }
    return result;
  }
  itemList() {
    const result = [{ id: 0, name: "(none)" }];
    for (let id = 1; id < 1300; id++) {
      const name = this.itemName(id);
      if (name && !name.startsWith("item") && /[A-Za-z0-9]/.test(name)) result.push({ id, name });
    }
    return result;
  }
  editableItems() {
    const result: EditableItem[] = [];
    for (let id = 1; id < 1300; id++) {
      const pocket = this.itemPocket(id); if (pocket > 5) break;
      const name = this.itemName(id); if (!name || name.startsWith("item")) continue;
      if (pocket === 1) result.push({ id, name, pocket: "items" });
      if (pocket === 2) result.push({ id, name, pocket: "balls" });
    }
    return result;
  }

  private bagKey() { return u32(this.data, this.sections.get(0)! + KEY_OFF) & 0xffff; }
  bagQuantity(id: number, pocket: Pocket) {
    const [off, count] = pocket === "items" ? [BAG_ITEMS_OFF, 60] : [BAG_BALLS_OFF, 20]; const block = this.sb1; const key = this.bagKey();
    for (let i = 0; i < count; i++) if (u16(block, off + i * 4) === id) return u16(block, off + i * 4 + 2) ^ key;
    return 0;
  }
  setBagQuantity(id: number, quantity: number, pocket: Pocket) {
    quantity = Math.max(0, Math.min(99, Math.trunc(quantity)));
    const [off, count] = pocket === "items" ? [BAG_ITEMS_OFF, 60] : [BAG_BALLS_OFF, 20]; const block = this.sb1;
    let existing = -1, empty = -1;
    for (let i = 0; i < count; i++) { const stored = u16(block, off + i * 4); if (stored === id) { existing = i; break; } if (!stored && empty < 0) empty = i; }
    const slot = existing >= 0 ? existing : empty; if (slot < 0) throw new Error(`No free slot in the ${pocket} pocket.`);
    const payload = new Uint8Array(4); set16(payload, 0, quantity ? id : 0); set16(payload, 2, quantity ? quantity ^ this.bagKey() : 0); this.writeSb1(off + slot * 4, payload);
  }
  pcQuantity(id: number) { const block = this.sb1; for (let i = 0; i < 50; i++) if (u16(block, PC_ITEMS_OFF + i * 4) === id) return u16(block, PC_ITEMS_OFF + i * 4 + 2); return 0; }
  setPcQuantity(id: number, quantity: number) {
    quantity = Math.max(0, Math.min(999, Math.trunc(quantity))); const block = this.sb1; let existing = -1, empty = -1;
    for (let i = 0; i < 50; i++) { const stored = u16(block, PC_ITEMS_OFF + i * 4); if (stored === id) { existing = i; break; } if (!stored && empty < 0) empty = i; }
    if (!quantity && existing < 0) return; const slot = existing >= 0 ? existing : empty; if (slot < 0) throw new Error("No free PC item slot.");
    const payload = new Uint8Array(4); set16(payload, 0, quantity ? id : 0); set16(payload, 2, quantity); this.writeSb1(PC_ITEMS_OFF + slot * 4, payload);
  }

  applyEssentialsPreset() {
    const bagBalls = new Set(["Poké Ball", "Great Ball", "Ultra Ball", "Premier Ball", "Master Ball", "Quick Ball"]);
    const essentials = ["Full Restore", "Max Revive", "Nugget", "Rare Candy", "Max Elixir", "Max Repel"];
    const items = this.editableItems(); const byName = new Map(items.map(item => [item.name, item])); const balls = items.filter(item => item.pocket === "balls");
    if (balls.length !== 27) throw new Error(`Expected 27 Ball types, found ${balls.length}.`);
    [...bagBalls, ...essentials].forEach(name => { if (!byName.has(name)) throw new Error(`Item missing from ROM: ${name}`); });
    const snapshot = this.data.slice();
    try { balls.forEach(ball => { this.setBagQuantity(ball.id, 0, "balls"); this.setPcQuantity(ball.id, 0); }); balls.forEach(ball => bagBalls.has(ball.name) ? this.setBagQuantity(ball.id, 99, "balls") : this.setPcQuantity(ball.id, 99)); essentials.forEach(name => { const item = byName.get(name)!; this.setBagQuantity(item.id, 99, item.pocket); }); }
    catch (error) { this.data = snapshot; throw error; }
  }

  private decodeMon(raw: Uint8Array) {
    const pv = u32(raw, 0), otid = u32(raw, 4), key = (pv ^ otid) >>> 0; const dec = raw.slice(0x20, 0x50);
    for (let i = 0; i < 48; i += 4) set32(dec, i, (u32(dec, i) ^ key) >>> 0);
    const order = SUBSTRUCT_ORDER[pv % 24]; const g = order.indexOf("G") * 12; const a = order.indexOf("A") * 12; const e = order.indexOf("E") * 12; const m = order.indexOf("M") * 12;
    return { pv, otid, key, dec, g, a, e, m, species: u16(dec, g), valid: u16(raw, 0x1c) === this.monChecksum(dec) };
  }
  private monChecksum(dec: Uint8Array) { let sum = 0; for (let i = 0; i < 48; i += 2) sum = (sum + u16(dec, i)) & 0xffff; return sum; }
  private encodeMon(raw: Uint8Array, mon: ReturnType<SeaglassWebSave["decodeMon"]>) {
    const out = raw.slice(); set16(out, 0x1c, this.monChecksum(mon.dec)); const enc = mon.dec.slice(); for (let i = 0; i < 48; i += 4) set32(enc, i, (u32(enc, i) ^ mon.key) >>> 0); out.set(enc, 0x20); return out;
  }

  private isShiny(pv: number, otid: number) { return (((otid & 0xffff) ^ (otid >>> 16) ^ (pv & 0xffff) ^ (pv >>> 16)) & 0xffff) < 8; }
  private genderOf(pv: number, species: number) { const ratio = this.genderRatio(species); if (ratio === 255) return "N"; if (ratio === 254) return "F"; if (ratio === 0) return "M"; return (pv & 0xff) < ratio ? "F" : "M"; }
  private newPv(species: number, otid: number, nature: number, gender: "M" | "F" | "N", shiny: boolean) {
    const tidSid = (otid & 0xffff) ^ (otid >>> 16);
    for (let attempt = 0; attempt < 2_000_000; attempt++) {
      const low = Math.floor(Math.random() * 0x10000); const high = shiny ? (low ^ tidSid ^ Math.floor(Math.random() * 8)) & 0xffff : Math.floor(Math.random() * 0x10000); const pv = ((high << 16) | low) >>> 0;
      if (pv % 25 === nature && this.genderOf(pv, species) === gender && this.isShiny(pv, otid) === shiny) return pv;
    }
    throw new Error("Could not generate the requested nature, gender, and shiny combination.");
  }

  private levelFromExperience(species: number, experience: number) {
    const group = this.growthRate(species); let level = 1;
    for (let candidate = 2; candidate <= 100; candidate++) { if (expAt(group, candidate) > experience) break; level = candidate; }
    return level;
  }
  private record(raw: Uint8Array, location: PokemonLocation): PokemonRecord | null {
    const mon = this.decodeMon(raw);
    if (!mon.valid || mon.species < 1 || mon.species > 1300) return null;
    const ivWord = u32(mon.dec, mon.m + 4), experience = u32(mon.dec, mon.g + 4);
    return {
      location, species: mon.species, nickname: decodeString(raw.subarray(8, 0x12)),
      level: location.kind === "party" ? Math.max(1, raw[0x54]) : this.levelFromExperience(mon.species, experience),
      nature: mon.pv % 25, gender: this.genderOf(mon.pv, mon.species) as "M" | "F" | "N",
      shiny: this.isShiny(mon.pv, mon.otid), abilitySlot: ((ivWord >>> 31) & 1) as 0 | 1,
      heldItem: u16(mon.dec, mon.g + 2), friendship: mon.dec[mon.g + 9],
      moves: Array.from({ length: 4 }, (_, i) => u16(mon.dec, mon.a + i * 2)),
      pp: Array.from(mon.dec.subarray(mon.a + 8, mon.a + 12)),
      ivs: Array.from({ length: 6 }, (_, i) => (ivWord >>> (5 * i)) & 31),
      evs: Array.from(mon.dec.subarray(mon.e, mon.e + 6)),
      otName: decodeString(raw.subarray(0x14, 0x1b)), isEgg: Boolean(ivWord & 0x40000000),
    };
  }
  partyPokemon() {
    const sb1 = this.sb1, count = Math.min(u32(sb1, PARTY_COUNT_OFF), 6), result: PokemonRecord[] = [];
    for (let index = 0; index < count; index++) { const mon = this.record(sb1.slice(PARTY_OFF + index * 100, PARTY_OFF + (index + 1) * 100), { kind: "party", index }); if (mon) result.push(mon); }
    return result;
  }
  boxPokemon(index: number) {
    if (index < 0 || index >= 420) return null;
    return this.record(this.storage.slice(4 + index * 80, 4 + (index + 1) * 80), { kind: "box", index });
  }

  boxSlots(box = 0) {
    const result: { index: number; occupied: boolean; species: number; name: string; nickname: string; level: number; shiny: boolean }[] = [];
    for (let position = 0; position < 30; position++) { const index = box * 30 + position, mon = this.boxPokemon(index), occupied = Boolean(mon); result.push({ index, occupied, species: mon?.species ?? 0, name: mon ? this.speciesName(mon.species) : "Empty", nickname: mon?.nickname ?? "", level: mon?.level ?? 0, shiny: mon?.shiny ?? false }); }
    return result;
  }

  updatePokemon(location: PokemonLocation, draft: NewPokemon) {
    const party = location.kind === "party", size = party ? 100 : 80;
    const logicalOff = party ? PARTY_OFF + location.index * 100 : 4 + location.index * 80;
    const source = party ? this.sb1 : this.storage, raw = source.slice(logicalOff, logicalOff + size), current = this.decodeMon(raw);
    if (!current.valid || !current.species) throw new Error("That Pokémon could not be read.");
    const species = Math.max(1, Math.min(1300, Math.trunc(draft.species))), nature = Math.max(0, Math.min(24, Math.trunc(draft.nature)));
    const ratio = this.genderRatio(species), gender: "M" | "F" | "N" = ratio === 255 ? "N" : ratio === 254 ? "F" : ratio === 0 ? "M" : draft.gender;
    const pvMatches = current.pv % 25 === nature && this.genderOf(current.pv, species) === gender && this.isShiny(current.pv, current.otid) === draft.shiny;
    const pv = pvMatches ? current.pv : this.newPv(species, current.otid, nature, gender, draft.shiny);
    const blocks: Record<string, Uint8Array> = {
      G: current.dec.slice(current.g, current.g + 12), A: current.dec.slice(current.a, current.a + 12),
      E: current.dec.slice(current.e, current.e + 12), M: current.dec.slice(current.m, current.m + 12),
    };
    const level = Math.max(1, Math.min(100, Math.trunc(draft.level)));
    set16(blocks.G, 0, species); set16(blocks.G, 2, Math.max(0, Math.trunc(draft.heldItem)));
    set32(blocks.G, 4, expAt(this.growthRate(species), level)); blocks.G[9] = Math.max(0, Math.min(255, Math.trunc(draft.friendship)));
    for (let i = 0; i < 4; i++) { set16(blocks.A, i * 2, Math.max(0, Math.trunc(draft.moves[i] || 0))); blocks.A[8 + i] = Math.max(0, Math.min(99, Math.trunc(draft.pp[i] || 0))); }
    for (let i = 0; i < 6; i++) blocks.E[i] = Math.max(0, Math.min(252, Math.trunc(draft.evs[i] || 0)));
    let ivWord = u32(blocks.M, 4) & 0x40000000; if (draft.abilitySlot) ivWord |= 0x80000000;
    for (let i = 0; i < 6; i++) ivWord |= (Math.max(0, Math.min(31, Math.trunc(draft.ivs[i] ?? 0))) & 31) << (5 * i);
    set32(blocks.M, 4, ivWord >>> 0);
    const order = SUBSTRUCT_ORDER[pv % 24], dec = new Uint8Array(48); order.split("").forEach((key, blockIndex) => dec.set(blocks[key], blockIndex * 12));
    set32(raw, 0, pv); raw.set(encodeString(draft.nickname || this.speciesName(species), 10), 8);
    const changed = { pv, otid: current.otid, key: (pv ^ current.otid) >>> 0, dec, g: order.indexOf("G") * 12, a: order.indexOf("A") * 12, e: order.indexOf("E") * 12, m: order.indexOf("M") * 12, species, valid: true };
    const out = this.encodeMon(raw, changed);
    if (party) {
      out[0x54] = level; const base = this.baseStats(species), [boost, lower] = NATURE_MOD[nature];
      const core = (i: number) => Math.floor((2 * base[i] + (draft.ivs[i] || 0) + Math.floor((draft.evs[i] || 0) / 4)) * level / 100);
      const stats = [species === 292 ? 1 : core(0) + level + 10];
      for (let i = 1; i < 6; i++) { let value = core(i) + 5; if (boost !== lower) value = i - 1 === boost ? Math.floor(value * 1.1) : i - 1 === lower ? Math.floor(value * .9) : value; stats.push(value); }
      [stats[0], ...stats].forEach((value, i) => set16(out, 0x56 + i * 2, value));
    }
    if (party) this.writeSb1(logicalOff, out); else this.writeStorage(logicalOff, out);
  }

  private lz77(offset: number) {
    if (offset < 0 || offset + 4 > this.rom.length || this.rom[offset] !== 0x10) return null;
    const size = this.rom[offset + 1] | (this.rom[offset + 2] << 8) | (this.rom[offset + 3] << 16);
    if (!size || size > 0x4000) return null;
    const out: number[] = []; let cursor = offset + 4;
    try {
      while (out.length < size) {
        const flags = this.rom[cursor++];
        for (let bit = 0; bit < 8 && out.length < size; bit++) {
          if (flags & (0x80 >> bit)) { const hi = this.rom[cursor++], lo = this.rom[cursor++], length = (hi >>> 4) + 3, distance = ((hi & 15) << 8 | lo) + 1; if (distance > out.length) return null; for (let i = 0; i < length && out.length < size; i++) out.push(out[out.length - distance]); }
          else out.push(this.rom[cursor++]);
        }
      }
    } catch { return null; }
    return new Uint8Array(out);
  }
  spriteRgba(species: number, shiny = false): SpriteData | null {
    const key = `${species}:${shiny ? 1 : 0}`; if (this.spriteCache.has(key)) return this.spriteCache.get(key)!;
    try {
      const base = SPECIES_NAME_1 + (species - 1) * SPECIES_STRIDE - 0x2c;
      const pic = u32(this.rom, base + 0x58) - 0x08000000, palettePtr = u32(this.rom, base + (shiny ? 0x70 : 0x68)) - 0x08000000;
      const tiles = this.lz77(pic), paletteBytes = this.lz77(palettePtr); if (!tiles || !paletteBytes || tiles.length < 2048 || paletteBytes.length < 32) { this.spriteCache.set(key, null); return null; }
      const palette = Array.from({ length: 16 }, (_, i) => { const color = paletteBytes[i * 2] | (paletteBytes[i * 2 + 1] << 8); return [(color & 31) * 255 / 31, ((color >>> 5) & 31) * 255 / 31, ((color >>> 10) & 31) * 255 / 31, i ? 255 : 0]; });
      const pixels = new Uint8ClampedArray(64 * 64 * 4);
      for (let ty = 0; ty < 8; ty++) for (let tx = 0; tx < 8; tx++) for (let row = 0; row < 8; row++) for (let column = 0; column < 4; column++) {
        const packed = tiles[(ty * 8 + tx) * 32 + row * 4 + column];
        for (let half = 0; half < 2; half++) { const color = palette[half ? packed >>> 4 : packed & 15], pixel = ((ty * 8 + row) * 64 + tx * 8 + column * 2 + half) * 4; pixels.set(color, pixel); }
      }
      const sprite = { width: 64, height: 64, pixels }; this.spriteCache.set(key, sprite); return sprite;
    } catch { this.spriteCache.set(key, null); return null; }
  }

  addBoxPokemon(index: number, draft: NewPokemon) {
    if (index < 0 || index >= 420) throw new Error("Invalid PC box slot.");
    const off = 4 + index * 80, storage = this.storage, current = this.decodeMon(storage.slice(off, off + 80));
    if (current.valid && current.species) throw new Error("That PC slot is no longer empty.");
    const sec0 = this.sections.get(0)!; const tid = u16(this.data, sec0 + 0x0a), sid = u16(this.data, sec0 + 0x0c), otid = (tid | (sid << 16)) >>> 0;
    const ratio = this.genderRatio(draft.species); const fixedGender: "M" | "F" | "N" = ratio === 255 ? "N" : ratio === 254 ? "F" : ratio === 0 ? "M" : draft.gender;
    const pv = this.newPv(draft.species, otid, Math.max(0, Math.min(24, draft.nature)), fixedGender, draft.shiny);
    const raw = new Uint8Array(80); set32(raw, 0, pv); set32(raw, 4, otid); raw.set(encodeString(draft.nickname || this.speciesName(draft.species), 10), 8); raw[0x12] = 2; raw.set(this.data.subarray(sec0, sec0 + 7), 0x14);
    const blocks: Record<string, Uint8Array> = { G: new Uint8Array(12), A: new Uint8Array(12), E: new Uint8Array(12), M: new Uint8Array(12) };
    for (let templateIndex = 0; templateIndex < 420; templateIndex++) { const templateRaw = storage.slice(4 + templateIndex * 80, 4 + (templateIndex + 1) * 80), template = this.decodeMon(templateRaw); if (template.valid && template.species) { blocks.M.set(template.dec.subarray(template.m, template.m + 12)); raw[0x13] = templateRaw[0x13]; break; } }
    set16(blocks.G, 0, draft.species); set16(blocks.G, 2, draft.heldItem || 0); set32(blocks.G, 4, expAt(this.growthRate(draft.species), Math.max(1, Math.min(100, draft.level)))); blocks.G[9] = Math.max(0, Math.min(255, draft.friendship));
    for (let i = 0; i < 4; i++) { set16(blocks.A, i * 2, draft.moves[i] || 0); blocks.A[8 + i] = Math.max(0, Math.min(99, draft.pp[i] || 0)); }
    for (let i = 0; i < 6; i++) blocks.E[i] = Math.max(0, Math.min(252, draft.evs[i] || 0));
    blocks.M[0] = 0; blocks.M.fill(0, 8, 12); const level = Math.max(1, Math.min(100, draft.level)); set16(blocks.M, 2, (u16(blocks.M, 2) & 0xff80) | (level & 0x7f));
    let ivWord = draft.abilitySlot ? 0x80000000 : 0; for (let i = 0; i < 6; i++) ivWord |= (Math.max(0, Math.min(31, draft.ivs[i] ?? 31)) & 31) << (5 * i); set32(blocks.M, 4, ivWord >>> 0);
    const order = SUBSTRUCT_ORDER[pv % 24], dec = new Uint8Array(48); order.split("").forEach((key, blockIndex) => dec.set(blocks[key], blockIndex * 12));
    const mon = { pv, otid, key: (pv ^ otid) >>> 0, dec, g: order.indexOf("G") * 12, a: order.indexOf("A") * 12, e: order.indexOf("E") * 12, m: order.indexOf("M") * 12, species: draft.species, valid: true };
    this.writeStorage(off, this.encodeMon(raw, mon));
  }
  private perfectMon(raw: Uint8Array, party: boolean) {
    const mon = this.decodeMon(raw); if (!mon.valid || mon.species < 1 || mon.species > 1300) return null;
    const flags = u32(mon.dec, mon.m + 4) & 0xc0000000; set32(mon.dec, mon.m + 4, flags | 0x3fffffff); const out = this.encodeMon(raw, mon);
    if (party) {
      const base = this.baseStats(mon.species), level = out[0x54], nature = mon.pv % 25; const [boost, lower] = NATURE_MOD[nature]; const ev = Array.from(mon.dec.subarray(mon.e, mon.e + 6));
      const core = (i: number) => Math.floor((2 * base[i] + 31 + Math.floor(ev[i] / 4)) * level / 100);
      const stats = [mon.species === 292 ? 1 : core(0) + level + 10];
      for (let i = 1; i < 6; i++) { let value = core(i) + 5; if (boost !== lower) { if (i - 1 === boost) value = Math.floor(value * 1.1); else if (i - 1 === lower) value = Math.floor(value * 0.9); } stats.push(value); }
      [stats[0], ...stats].forEach((value, i) => set16(out, 0x56 + i * 2, value));
    }
    return out;
  }
  maxAllIvs() {
    const sb1 = this.sb1; const partyCount = Math.min(u32(sb1, PARTY_COUNT_OFF), 6); let party = 0, boxed = 0;
    for (let i = 0; i < partyCount; i++) { const off = PARTY_OFF + i * 100; const perfect = this.perfectMon(sb1.slice(off, off + 100), true); if (perfect) { this.writeSb1(off, perfect); party++; } }
    const storage = this.storage;
    for (let i = 0; i < 420; i++) { const off = 4 + i * 80; const perfect = this.perfectMon(storage.slice(off, off + 80), false); if (perfect) { this.writeStorage(off, perfect); boxed++; } }
    return { party, boxed };
  }

  pokemonSummary() {
    const rows: { location: string; name: string }[] = []; const sb1 = this.sb1; const count = Math.min(u32(sb1, PARTY_COUNT_OFF), 6);
    for (let i = 0; i < count; i++) { const mon = this.decodeMon(sb1.slice(PARTY_OFF + i * 100, PARTY_OFF + i * 100 + 100)); if (mon.valid) rows.push({ location: `Party ${i + 1}`, name: this.speciesName(mon.species) }); }
    const storage = this.storage; for (let i = 0; i < 420; i++) { const mon = this.decodeMon(storage.slice(4 + i * 80, 4 + (i + 1) * 80)); if (mon.valid && mon.species) rows.push({ location: `Box ${Math.floor(i / 30) + 1}`, name: this.speciesName(mon.species) }); }
    return rows;
  }
}
