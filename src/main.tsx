import React, { useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { NewPokemon, SeaglassWebSave } from "./seaglass";
import "./styles.css";

type Tab = "auto" | "pokemon" | "bag";
const DB_NAME = "seaglass-editor";
const NATURES = ["Hardy","Lonely","Brave","Adamant","Naughty","Bold","Docile","Relaxed","Impish","Lax","Timid","Hasty","Serious","Jolly","Naive","Modest","Mild","Quiet","Bashful","Rash","Calm","Gentle","Sassy","Careful","Quirky"];

function romStore(mode: "get" | "put", value?: ArrayBuffer): Promise<ArrayBuffer | null> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => request.result.createObjectStore("files");
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const db = request.result, tx = db.transaction("files", mode === "put" ? "readwrite" : "readonly"), store = tx.objectStore("files");
      const op = mode === "put" ? store.put(value!, "rom") : store.get("rom");
      op.onsuccess = () => resolve(mode === "get" ? (op.result ?? null) : value ?? null);
      op.onerror = () => reject(op.error);
    };
  });
}

function AddPokemonForm({ editor, slot, onAdd }: { editor: SeaglassWebSave; slot: number; onAdd: (draft: NewPokemon) => void }) {
  const species = useMemo(() => editor.speciesList(), [editor]);
  const moves = useMemo(() => editor.moveList(), [editor]);
  const heldItems = useMemo(() => [{ id: 0, name: "(none)" }, ...editor.editableItems()], [editor]);
  const [speciesId, setSpeciesId] = useState(species[0]?.id ?? 1), [nickname, setNickname] = useState(""), [level, setLevel] = useState(5), [nature, setNature] = useState(0), [gender, setGender] = useState<"M" | "F" | "N">("M"), [shiny, setShiny] = useState(false), [abilitySlot, setAbilitySlot] = useState<0 | 1>(0), [heldItem, setHeldItem] = useState(0), [friendship, setFriendship] = useState(70), [moveIds, setMoveIds] = useState([0,0,0,0]), [pp, setPp] = useState([0,0,0,0]), [ivs, setIvs] = useState([31,31,31,31,31,31]), [evs, setEvs] = useState([0,0,0,0,0,0]);
  const abilities = editor.speciesAbilities(speciesId), ratio = editor.genderRatio(speciesId);
  useEffect(() => { setNickname(editor.speciesName(speciesId)); setFriendship(editor.baseFriendship(speciesId)); setAbilitySlot(0); if (ratio === 255) setGender("N"); else if (ratio === 254) setGender("F"); else if (ratio === 0) setGender("M"); }, [speciesId]);
  const updateArray = (setter: React.Dispatch<React.SetStateAction<number[]>>, index: number, value: number) => setter(current => current.map((entry, i) => i === index ? value : entry));
  return <article className="card add-form"><div className="eyebrow">Box {Math.floor(slot / 30) + 1} · Slot {slot % 30 + 1}</div><h2>Add a Pokémon</h2><p>Create a new encrypted boxed Pokémon owned by this save’s trainer.</p>
    <div className="form-grid">
      <label>Species<select value={speciesId} onChange={e => setSpeciesId(Number(e.target.value))}>{species.map(entry => <option key={entry.id} value={entry.id}>{entry.name} · #{entry.id}</option>)}</select></label>
      <label>Nickname<input maxLength={10} value={nickname} onChange={e => setNickname(e.target.value)} /></label>
      <label>Level<input type="number" min="1" max="100" value={level} onChange={e => setLevel(Number(e.target.value))} /></label>
      <label>Nature<select value={nature} onChange={e => setNature(Number(e.target.value))}>{NATURES.map((name, index) => <option key={name} value={index}>{name}</option>)}</select></label>
      <label>Gender<select value={gender} disabled={ratio === 0 || ratio >= 254} onChange={e => setGender(e.target.value as "M" | "F" | "N")}><option value="M">Male</option><option value="F">Female</option>{ratio === 255 && <option value="N">Genderless</option>}</select></label>
      <label>Ability<select value={abilitySlot} onChange={e => setAbilitySlot(Number(e.target.value) as 0 | 1)}>{abilities.map(ability => <option key={ability.slot} value={ability.slot}>{ability.name}</option>)}</select></label>
      <label>Held item<select value={heldItem} onChange={e => setHeldItem(Number(e.target.value))}>{heldItems.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
      <label>Friendship<input type="number" min="0" max="255" value={friendship} onChange={e => setFriendship(Number(e.target.value))} /></label>
    </div>
    <label className="shiny-check"><input type="checkbox" checked={shiny} onChange={e => setShiny(e.target.checked)} /> Shiny Pokémon</label>
    <h3>Moves</h3><div className="move-grid">{moveIds.map((moveId, index) => <React.Fragment key={index}><select aria-label={`Move ${index + 1}`} value={moveId} onChange={e => updateArray(setMoveIds, index, Number(e.target.value))}>{moves.map(move => <option key={move.id} value={move.id}>{move.name}</option>)}</select><input aria-label={`Move ${index + 1} PP`} type="number" min="0" max="99" value={pp[index]} onChange={e => updateArray(setPp, index, Number(e.target.value))} /></React.Fragment>)}</div>
    <h3>IVs and EVs</h3><div className="stats-grid"><span />{["HP","Atk","Def","Spe","SpA","SpD"].map(label => <strong key={label}>{label}</strong>)}<span>IV</span>{ivs.map((value,index) => <input aria-label={`${["HP","Atk","Def","Speed","Special Attack","Special Defense"][index]} IV`} key={`iv${index}`} type="number" min="0" max="31" value={value} onChange={e => updateArray(setIvs,index,Number(e.target.value))} />)}<span>EV</span>{evs.map((value,index) => <input aria-label={`${["HP","Atk","Def","Speed","Special Attack","Special Defense"][index]} EV`} key={`ev${index}`} type="number" min="0" max="252" value={value} onChange={e => updateArray(setEvs,index,Number(e.target.value))} />)}</div>
    <button className="primary wide" onClick={() => onAdd({ species: speciesId, nickname, level, nature, gender, shiny, abilitySlot, heldItem, friendship, moves: moveIds, pp, ivs, evs })}>Add Pokémon to Empty Slot</button>
  </article>;
}

function App() {
  const [theme, setTheme] = useState<"dark" | "light">(() => (localStorage.getItem("theme") as "dark" | "light") || "dark");
  const [tab, setTab] = useState<Tab>("auto");
  const [rom, setRom] = useState<ArrayBuffer | null>(null);
  const [saveBuffer, setSaveBuffer] = useState<ArrayBuffer | null>(null);
  const [saveName, setSaveName] = useState("edited.sav");
  const [editor, setEditor] = useState<SeaglassWebSave | null>(null);
  const [notice, setNotice] = useState("Choose your Seaglass ROM once, then open a save.");
  const [selectedId, setSelectedId] = useState(0);
  const [quantity, setQuantity] = useState(99);
  const [box, setBox] = useState(0), [boxSlot, setBoxSlot] = useState<number | null>(null);
  const saveInput = useRef<HTMLInputElement>(null), romInput = useRef<HTMLInputElement>(null);

  useEffect(() => { romStore("get").then(stored => { if (stored) { setRom(stored); setNotice("Remembered Seaglass ROM ready. Open a save to begin."); } }).catch(() => {}); }, []);
  useEffect(() => { document.documentElement.dataset.theme = theme; localStorage.setItem("theme", theme); }, [theme]);
  useEffect(() => {
    if (!rom || !saveBuffer) return;
    try { const next = new SeaglassWebSave(saveBuffer, rom); setEditor(next); setNotice(`Save ready · slot ${next.activeSlot ? "B" : "A"} · checksums ${next.verifyChecksums().length ? "need attention" : "OK"}`); }
    catch (error) { setEditor(null); setNotice(error instanceof Error ? error.message : "Could not open those files."); }
  }, [rom, saveBuffer]);

  const items = useMemo(() => editor?.editableItems() ?? [], [editor]);
  const selected = items.find(item => item.id === selectedId) ?? items[0];
  useEffect(() => { if (items.length && !items.some(item => item.id === selectedId)) setSelectedId(items[0].id); }, [items, selectedId]);
  useEffect(() => { if (editor && selected) setQuantity(editor.bagQuantity(selected.id, selected.pocket)); }, [editor, selected?.id]);

  async function chooseRom(file?: File) {
    if (!file) return; const buffer = await file.arrayBuffer();
    try { await romStore("put", buffer); setRom(buffer); setNotice("ROM verified and remembered only in this browser."); }
    catch { setRom(buffer); setNotice("ROM loaded for this session."); }
  }
  async function chooseSave(file?: File) { if (!file) return; setSaveName(file.name.replace(/\.(sav|srm)$/i, "") + "_edited.sav"); setSaveBuffer(await file.arrayBuffer()); }
  function mutate(action: (current: SeaglassWebSave) => string) {
    if (!editor) return;
    try { const message = action(editor); setEditor(Object.assign(Object.create(Object.getPrototypeOf(editor)), editor)); setNotice(`${message} · checksums ${editor.verifyChecksums().length ? "BAD" : "OK"}`); }
    catch (error) { setNotice(error instanceof Error ? error.message : "The edit could not be applied."); }
  }
  function downloadSave() {
    if (!editor) return; const blob = new Blob([new Uint8Array(editor.data).buffer], { type: "application/octet-stream" }); const url = URL.createObjectURL(blob); const link = document.createElement("a"); link.href = url; link.download = saveName; link.click(); URL.revokeObjectURL(url);
  }
  function addPokemon(draft: NewPokemon) {
    if (!editor || boxSlot == null) return;
    try { editor.addBoxPokemon(boxSlot, draft); setEditor(Object.assign(Object.create(Object.getPrototypeOf(editor)), editor)); setNotice(`${editor.speciesName(draft.species)} added to Box ${Math.floor(boxSlot / 30) + 1}, Slot ${boxSlot % 30 + 1} · checksums ${editor.verifyChecksums().length ? "BAD" : "OK"}`); setBoxSlot(null); }
    catch (error) { setNotice(error instanceof Error ? error.message : "The Pokémon could not be added."); }
  }

  return <main className="shell">
    <header className="topbar">
      <div className="brand"><span className="gem">◇</span><div><h1>Seaglass Save Editor</h1><p>Private, local, checksum-safe</p></div></div>
      <div className="toolbar">
        <input ref={romInput} hidden type="file" accept=".gba" onChange={e => chooseRom(e.target.files?.[0])} />
        <input ref={saveInput} hidden type="file" accept=".sav,.srm" onChange={e => chooseSave(e.target.files?.[0])} />
        <button className="secondary" onClick={() => romInput.current?.click()}>{rom ? "Replace ROM" : "Choose ROM"}</button>
        <button className="secondary" onClick={() => saveInput.current?.click()}>Open Save</button>
        <button className="primary" disabled={!editor} onClick={downloadSave}>Download Edited Save</button>
        <button className="theme" aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} mode`} onClick={() => setTheme(theme === "dark" ? "light" : "dark")}>{theme === "dark" ? "☀" : "☾"}</button>
      </div>
    </header>

    <section className="privacy"><span className={rom ? "dot ready" : "dot"} /> <strong>{rom ? "ROM ready" : "ROM needed"}</strong><span>Files are processed on this device and are never uploaded.</span></section>
    <nav className="tabs" aria-label="Editor sections">
      {([['auto','Auto Fills'],['pokemon','Pokémon'],['bag','Bag']] as [Tab,string][]).map(([id, label]) => <button key={id} className={tab === id ? "active" : ""} onClick={() => setTab(id)}>{label}</button>)}
    </nav>

    <section className="workspace">
      {!editor && <div className="empty"><div className="empty-gem">◇</div><h2>Bring your own save</h2><p>Your ROM is remembered locally after the first selection. Saves always remain on your device.</p><button className="primary" onClick={() => saveInput.current?.click()} disabled={!rom}>{rom ? "Open a save" : "Choose a ROM first"}</button></div>}
      {editor && tab === "auto" && <div className="cards">
        <article className="card"><div className="eyebrow">Items & Poké Balls</div><h2>Stock the essentials</h2><p>Sets six selected Balls and six essentials to 99 in the Bag. The other 21 Ball types go to PC storage. Existing stacks are updated, never added past 99.</p><button className="primary wide" onClick={() => mutate(e => { e.applyEssentialsPreset(); return "Essentials and all Balls updated"; })}>Add 99 Essentials + All Balls</button></article>
        <article className="card"><div className="eyebrow">Pokémon IVs</div><h2>Perfect every Pokémon</h2><p>Sets all six IVs to 31 for every party and boxed Pokémon. Party battle stats are recalculated from the selected Seaglass ROM.</p><button className="primary wide" onClick={() => mutate(e => { const count = e.maxAllIvs(); return `Maxed IVs for ${count.party} party and ${count.boxed} boxed Pokémon`; })}>Max IVs for All Pokémon</button></article>
      </div>}
      {editor && tab === "bag" && <div className="single-card"><article className="card"><div className="eyebrow">Bag quantities</div><h2>Add or update an item</h2><div className="form-row"><label>Item<select value={selected?.id ?? 0} onChange={e => setSelectedId(Number(e.target.value))}>{items.map(item => <option key={item.id} value={item.id}>{item.name} · {item.pocket === "balls" ? "Balls" : "Items"}</option>)}</select></label><label>Quantity<input type="number" min="0" max="99" value={quantity} onChange={e => setQuantity(Number(e.target.value))} /></label></div><p className="current">Current quantity: {selected ? editor.bagQuantity(selected.id, selected.pocket) : 0}</p><button className="primary" disabled={!selected} onClick={() => selected && mutate(e => { e.setBagQuantity(selected.id, quantity, selected.pocket); return `${selected.name} set to ${Math.max(0, Math.min(99, quantity))}`; })}>Add / Update Item</button></article></div>}
      {editor && tab === "pokemon" && <div className="pokemon-layout"><article className="card box-browser"><div className="eyebrow">PC storage</div><div className="box-heading"><h2>Box {box + 1}</h2><select aria-label="PC Box" value={box} onChange={e => { setBox(Number(e.target.value)); setBoxSlot(null); }}>{Array.from({length:14},(_,index) => <option value={index} key={index}>Box {index + 1}</option>)}</select></div><p>Choose an empty slot to create a new Pokémon.</p><div className="box-grid">{editor.boxSlots(box).map((slot, index) => <button key={slot.index} className={`${slot.occupied ? "occupied" : "empty-slot"} ${boxSlot === slot.index ? "selected" : ""}`} onClick={() => { if (!slot.occupied) setBoxSlot(slot.index); else setNotice(`${slot.name} already occupies Box ${box + 1}, Slot ${index + 1}.`); }}><span>{index + 1}</span><strong>{slot.name}</strong></button>)}</div></article>{boxSlot == null ? <article className="card slot-help"><div className="empty-gem">◇</div><h2>Select an empty slot</h2><p>The new Pokémon editor will appear here. Occupied slots are protected from accidental replacement.</p></article> : <AddPokemonForm key={boxSlot} editor={editor} slot={boxSlot} onAdd={addPokemon} />}</div>}
    </section>
    <footer><span>{notice}</span><span>{saveBuffer ? saveName : "No save open"}</span></footer>
  </main>;
}

createRoot(document.getElementById("root")!).render(<React.StrictMode><App /></React.StrictMode>);
