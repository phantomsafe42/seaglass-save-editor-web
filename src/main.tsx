import React, { useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { EditableItem, SeaglassWebSave } from "./seaglass";
import "./styles.css";

type Tab = "auto" | "pokemon" | "bag";
const DB_NAME = "seaglass-editor";

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
      {editor && tab === "pokemon" && <div className="single-card"><article className="card"><div className="eyebrow">Save roster</div><h2>Party and PC boxes</h2><p>The full individual Pokémon form is the next porting step. Global IV editing is already available under Auto Fills.</p><div className="roster">{editor.pokemonSummary().map((mon, index) => <div className="mon" key={`${mon.location}-${index}`}><span>{mon.location}</span><strong>{mon.name}</strong></div>)}</div></article></div>}
    </section>
    <footer><span>{notice}</span><span>{saveBuffer ? saveName : "No save open"}</span></footer>
  </main>;
}

createRoot(document.getElementById("root")!).render(<React.StrictMode><App /></React.StrictMode>);
