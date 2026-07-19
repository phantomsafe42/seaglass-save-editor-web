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
const SUBSTRUCT_ORDER = ["GAEM","GAME","GEAM","GEMA","GMAE","GMEA","AGEM","AGME","AEGM","AEMG","AMGE","AMEG","EGAM","EGMA","EAGM","EAMG","EMGA","EMAG","MGAE","MGEA","MAGE","MAEG","MEGA","MEAG"];
const STAT_KEYS = ["hp", "atk", "def", "spe", "spa", "spd"];
const NATURE_MOD = Array.from({ length: 25 }, (_, n) => [Math.floor(n / 5), n % 5]);

const CHARS = new Map<number, string>([[0," "],[0xae,"-"],[0xad,"."],[0xba,"/"],[0xab,"!"],[0xac,"?"],[0xb4,"'"],[0x1b,"é"]]);
for (let i = 0; i < 10; i++) CHARS.set(0xa1 + i, String(i));
for (let i = 0; i < 26; i++) { CHARS.set(0xbb + i, String.fromCharCode(65 + i)); CHARS.set(0xd5 + i, String.fromCharCode(97 + i)); }

const u16 = (b: Uint8Array, o: number) => new DataView(b.buffer, b.byteOffset, b.byteLength).getUint16(o, true);
const u32 = (b: Uint8Array, o: number) => new DataView(b.buffer, b.byteOffset, b.byteLength).getUint32(o, true);
const set16 = (b: Uint8Array, o: number, v: number) => new DataView(b.buffer, b.byteOffset, b.byteLength).setUint16(o, v, true);
const set32 = (b: Uint8Array, o: number, v: number) => new DataView(b.buffer, b.byteOffset, b.byteLength).setUint32(o, v >>> 0, true);

function decodeString(bytes: Uint8Array) {
  let result = "";
  for (const value of bytes) { if (value === 0xff) break; result += CHARS.get(value) ?? ""; }
  return result.trimEnd();
}

function checksum(block: Uint8Array) {
  let total = 0;
  for (let i = 0; i < block.length; i += 4) total = (total + u32(block, i)) >>> 0;
  return (((total >>> 16) + (total & 0xffff)) & 0xffff) >>> 0;
}

export type Pocket = "items" | "balls";
export type EditableItem = { id: number; name: string; pocket: Pocket };

export class SeaglassWebSave {
  data: Uint8Array;
  rom: Uint8Array;
  sections = new Map<number, number>();
  activeSlot = -1;
  saveCounter = -1;

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
    const order = SUBSTRUCT_ORDER[pv % 24]; const g = order.indexOf("G") * 12; const e = order.indexOf("E") * 12; const m = order.indexOf("M") * 12;
    return { pv, otid, key, dec, g, e, m, species: u16(dec, g), valid: u16(raw, 0x1c) === this.monChecksum(dec) };
  }
  private monChecksum(dec: Uint8Array) { let sum = 0; for (let i = 0; i < 48; i += 2) sum = (sum + u16(dec, i)) & 0xffff; return sum; }
  private encodeMon(raw: Uint8Array, mon: ReturnType<SeaglassWebSave["decodeMon"]>) {
    const out = raw.slice(); set16(out, 0x1c, this.monChecksum(mon.dec)); const enc = mon.dec.slice(); for (let i = 0; i < 48; i += 4) set32(enc, i, (u32(enc, i) ^ mon.key) >>> 0); out.set(enc, 0x20); return out;
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
