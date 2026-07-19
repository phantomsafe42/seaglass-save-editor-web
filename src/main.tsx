import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { AbilitySlot, EvolutionFulfillment, EvolutionOption, NewPokemon, PokemonLocation, PokemonRecord, SeaglassWebSave } from "./seaglass";
import "./styles.css";

type Tab = "auto" | "pokemon" | "bag";
type PokemonSelection = PokemonLocation | { kind: "empty"; index: number };
type UndoEntry = { data: ArrayBuffer; selection: PokemonSelection | null; box: number; label: string };
type FormSnapshot = NewPokemon & { selectedEvolution: { target: number; method: number } | null };
const DB_NAME = "seaglass-editor";
const LOCAL_SAVE_CACHE = ["localhost", "127.0.0.1", "::1"].includes(window.location.hostname);
const CACHED_SAVE_NAME = "seaglass-editor-cached-save-name";
const NATURES = ["Hardy","Lonely","Brave","Adamant","Naughty","Bold","Docile","Relaxed","Impish","Lax","Timid","Hasty","Serious","Jolly","Naive","Modest","Mild","Quiet","Bashful","Rash","Calm","Gentle","Sassy","Careful","Quirky"];
const NATURE_STATS = ["Atk", "Def", "Spe", "SpA", "SpD"];
const NEUTRAL_NATURES = new Set([0, 6, 12, 18, 24]);
const natureLabel = (index: number) => NEUTRAL_NATURES.has(index) ? `${NATURES[index]} (neutral)` : `${NATURES[index]} (+${NATURE_STATS[Math.floor(index / 5)]} / −${NATURE_STATS[index % 5]})`;
const DISPLAY_STATS = [{ label: "HP", name: "HP", index: 0 }, { label: "Atk", name: "Attack", index: 1 }, { label: "Def", name: "Defense", index: 2 }, { label: "SpA", name: "Special Attack", index: 4 }, { label: "SpD", name: "Special Defense", index: 5 }, { label: "Spe", name: "Speed", index: 3 }] as const;
const CONTEST_STATS = ["Cool", "Beauty", "Cute", "Smart", "Tough"] as const;
const clamp = (value: number, minimum: number, maximum: number) => Math.max(minimum, Math.min(maximum, Number.isFinite(value) ? Math.trunc(value) : minimum));

function bufferStore(key: "rom" | "save", mode: "get" | "put", value?: ArrayBuffer): Promise<ArrayBuffer | null> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => request.result.createObjectStore("files");
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const db = request.result, tx = db.transaction("files", mode === "put" ? "readwrite" : "readonly"), store = tx.objectStore("files");
      const op = mode === "put" ? store.put(value!, key) : store.get(key);
      op.onsuccess = () => resolve(mode === "get" ? (op.result ?? null) : value ?? null);
      op.onerror = () => reject(op.error);
    };
  });
}

function PokemonSprite({ editor, species, shiny = false, className = "" }: { editor: SeaglassWebSave; species: number; shiny?: boolean; className?: string }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const sprite = editor.spriteRgba(species, shiny), context = canvas.current?.getContext("2d");
    if (!sprite || !context) return;
    context.clearRect(0, 0, 64, 64); context.putImageData(new ImageData(new Uint8ClampedArray(sprite.pixels), sprite.width, sprite.height), 0, 0);
  }, [editor, species, shiny]);
  return <canvas ref={canvas} width="64" height="64" className={`pokemon-sprite ${className}`} role="img" aria-label={`${shiny ? "Shiny " : ""}${editor.speciesName(species)}`} />;
}

function PokemonForm({ editor, location, initial, onSubmit, registerUndo }: { editor: SeaglassWebSave; location: string; initial?: PokemonRecord; onSubmit: (draft: NewPokemon) => boolean; registerUndo: (action: (() => string) | null) => void }) {
  const species = useMemo(() => editor.speciesList(), [editor]);
  const moves = useMemo(() => editor.moveList(), [editor]);
  const heldItems = useMemo(() => editor.itemList(), [editor]);
  const defaultSpecies = species[0]?.id ?? 1;
  const [speciesId, setSpeciesId] = useState(initial?.species ?? defaultSpecies), [nickname, setNickname] = useState(initial?.nickname ?? editor.speciesName(defaultSpecies)), [level, setLevel] = useState(initial?.level ?? 5), [nature, setNature] = useState(initial?.nature ?? 0), [gender, setGender] = useState<"M" | "F" | "N">(initial?.gender ?? "M"), [shiny, setShiny] = useState(initial?.shiny ?? false), [abilitySlot, setAbilitySlot] = useState<AbilitySlot>(initial?.abilitySlot ?? 0), [heldItem, setHeldItem] = useState(initial?.heldItem ?? 0), [friendship, setFriendship] = useState(initial?.friendship ?? editor.baseFriendship(defaultSpecies)), [moveIds, setMoveIds] = useState(initial?.moves ?? [0,0,0,0]), [pp, setPp] = useState(initial?.pp ?? [0,0,0,0]), [ppUps, setPpUps] = useState(initial?.ppUps ?? [0,0,0,0]), [ivs, setIvs] = useState(initial?.ivs ?? [31,31,31,31,31,31]), [evs, setEvs] = useState(initial?.evs ?? [0,0,0,0,0,0]), [contest, setContest] = useState(initial?.contest ?? [0,0,0,0,0]);
  const [returnedHeldItem, setReturnedHeldItem] = useState(0), [popup, setPopup] = useState("");
  const [experience, setExperience] = useState<number | undefined>(initial?.experience);
  const [choiceOpen, setChoiceOpen] = useState(false), [shedinjaChoice, setShedinjaChoice] = useState<EvolutionOption | null>(null);
  const [makePartyRoom, setMakePartyRoom] = useState(false), [evolutionMethod, setEvolutionMethod] = useState<number | undefined>(undefined);
  const [selectedEvolution, setSelectedEvolution] = useState<{ target: number; method: number } | null>(null);
  const [formHistory, setFormHistory] = useState<FormSnapshot[]>([]);
  const popupTimer = useRef<number | null>(null);
  const sheen = initial?.sheen ?? 0;
  const abilities = editor.speciesAbilities(speciesId), ratio = editor.genderRatio(speciesId);
  const preservedNeutralNature = initial && initial.nature !== 0 && NEUTRAL_NATURES.has(initial.nature) ? initial.nature : null;
  const natureOptions = NATURES.map((_, index) => index).filter(index => index === 0 || !NEUTRAL_NATURES.has(index) || (index === preservedNeutralNature && nature === preservedNeutralNature));
  const moveMethods = useMemo(() => editor.speciesMoveGroups(speciesId), [editor, speciesId]);
  const movepool = useMemo(() => new Set(Object.values(moveMethods).flatMap(group => [...group])), [moveMethods]);
  const moveGroups = [
    { label: "Level Up", moves: moves.filter(move => moveMethods.levelUp.has(move.id)) },
    { label: "TM / HM", moves: moves.filter(move => moveMethods.machine.has(move.id)) },
    { label: "Move Tutor", moves: moves.filter(move => moveMethods.tutor.has(move.id)) },
    { label: "Egg Moves", moves: moves.filter(move => moveMethods.egg.has(move.id)) },
    { label: "Other Moves", moves: moves.filter(move => !movepool.has(move.id)) },
  ].filter(group => group.moves.length);
  const evolutionOptions = editor.evolutionOptions({ species: speciesId, level, nature, gender, heldItem, friendship, moves: moveIds, ivs, evs, contest, experience, makePartyRoom });
  function changeSpecies(id: number) { rememberForm(); const nextRatio = editor.genderRatio(id); setSpeciesId(id); setNickname(editor.speciesName(id)); setFriendship(editor.baseFriendship(id)); setAbilitySlot(0); setReturnedHeldItem(0); setExperience(editor.experienceAtLevel(id, level)); setSelectedEvolution(null); if (nextRatio === 255) setGender("N"); else if (nextRatio === 254) setGender("F"); else if (nextRatio === 0) setGender("M"); else if (gender === "N") setGender("M"); }
  const updateArray = (setter: React.Dispatch<React.SetStateAction<number[]>>, index: number, value: number) => setter(current => current.map((entry, i) => i === index ? value : entry));
  const changeMove = (index: number, id: number) => { rememberForm(); updateArray(setMoveIds, index, id); updateArray(setPp, index, editor.moveMaxPp(id, ppUps[index])); };
  const changePpUps = (index: number, value: number) => { rememberForm(); const next = clamp(value, 0, 3); updateArray(setPpUps, index, next); updateArray(setPp, index, editor.moveMaxPp(moveIds[index], next)); };
  const updateEv = (index: number, value: number) => { rememberForm(); setEvs(current => { const otherTotal = current.reduce((total, entry, i) => total + (i === index ? 0 : entry), 0), maximum = Math.min(252, Math.max(0, 510 - otherTotal)); return current.map((entry, i) => i === index ? clamp(value, 0, maximum) : entry); }); };
  function showPopup(message: string) {
    setPopup(message); if (popupTimer.current != null) window.clearTimeout(popupTimer.current);
    popupTimer.current = window.setTimeout(() => setPopup(""), 2800);
  }
  function snapshotForm(): FormSnapshot {
    return { ...buildDraft(), moves: [...moveIds], pp: [...pp], ppUps: [...ppUps], ivs: [...ivs], evs: [...evs], contest: [...contest], selectedEvolution };
  }
  function rememberForm() { setFormHistory(current => [...current, snapshotForm()].slice(-20)); }
  function restoreForm(snapshot: FormSnapshot) {
    setSpeciesId(snapshot.species); setNickname(snapshot.nickname); setLevel(snapshot.level); setNature(snapshot.nature); setGender(snapshot.gender); setShiny(snapshot.shiny); setAbilitySlot(snapshot.abilitySlot); setHeldItem(snapshot.heldItem); setFriendship(snapshot.friendship);
    setMoveIds([...snapshot.moves]); setPp([...snapshot.pp]); setPpUps([...snapshot.ppUps]); setIvs([...snapshot.ivs]); setEvs([...snapshot.evs]); setContest([...snapshot.contest]); setReturnedHeldItem(snapshot.returnedHeldItem ?? 0); setExperience(snapshot.experience); setMakePartyRoom(snapshot.makePartyRoom ?? false); setEvolutionMethod(snapshot.evolutionMethod); setSelectedEvolution(snapshot.selectedEvolution); setChoiceOpen(false); setShedinjaChoice(null); setPopup("");
  }
  useEffect(() => {
    if (!formHistory.length) { registerUndo(null); return; }
    registerUndo(() => {
      const snapshot = formHistory[formHistory.length - 1];
      restoreForm(snapshot); setFormHistory(current => current.slice(0, -1));
      return "Undid Pokémon form change";
    });
    return () => registerUndo(null);
  }, [formHistory, registerUndo]);
  function fulfillEvolution(action: EvolutionFulfillment) {
    rememberForm();
    const pokemonName = nickname.trim() || editor.speciesName(speciesId);
    if (action.kind === "level") { setLevel(action.level); setExperience(action.experience); showPopup(`${pokemonName} is now 1 EXP point away from evolving`); }
    if (action.kind === "friendship") { setFriendship(action.value); setExperience(action.experience); showPopup(`${pokemonName} is now at max friendship and 1 EXP point away from evolving`); }
    if (action.kind === "beauty") { updateArray(setContest, 1, action.value); setExperience(action.experience); showPopup(`${pokemonName}'s Beauty is now ${action.value}, and ${pokemonName} is 1 EXP point away from evolving`); }
    if (action.kind === "move") {
      const index = moveIds.includes(action.move) ? moveIds.indexOf(action.move) : Math.max(0, moveIds.indexOf(0));
      updateArray(setMoveIds, index, action.move); updateArray(setPpUps, index, 0); updateArray(setPp, index, editor.moveMaxPp(action.move, 0)); setExperience(action.experience); showPopup(`${pokemonName} now knows ${editor.moveName(action.move)} and is 1 EXP point away from evolving`);
    }
    if (action.kind === "heldItem") {
      let message = `${pokemonName} is now holding a ${editor.itemName(action.item)}`;
      if (heldItem && heldItem !== action.item && !returnedHeldItem) {
        setReturnedHeldItem(heldItem); message += `. ${editor.itemName(heldItem)} was placed in your Bag`;
      }
      setHeldItem(action.item); showPopup(message);
    }
    if (action.kind === "stats") {
      setLevel(action.level); setExperience(action.experience); setNature(0);
      setIvs(current => current.map((value, index) => index === 1 ? (action.relation === "lower" ? 0 : 31) : index === 2 ? (action.relation === "higher" ? 0 : 31) : value));
      setEvs(current => current.map((value, index) => index === 1 || index === 2 ? 0 : value));
      showPopup(`${pokemonName}'s stats now meet the selected evolution condition, and ${pokemonName} is 1 EXP point away from evolving`);
    }
  }
  function applyEvolutionChoice(option: EvolutionOption) {
    setSelectedEvolution({ target: option.target, method: option.method });
    setEvolutionMethod(option.method);
    if (option.fulfillment) fulfillEvolution(option.fulfillment);
  }
  function chooseEvolution(option: EvolutionOption) {
    setChoiceOpen(false);
    if (speciesId === 290 && option.method === 13 && editor.partyPokemon().length >= 6) { setShedinjaChoice(option); return; }
    applyEvolutionChoice(option);
  }
  function requestFulfillment(option: EvolutionOption) {
    if (evolutionOptions.length > 1) setChoiceOpen(true); else chooseEvolution(option);
  }
  function buildDraft(overrides: Partial<NewPokemon> = {}): NewPokemon {
    return { species: speciesId, nickname, level, nature, gender, shiny, abilitySlot, heldItem, friendship, moves: moveIds, pp, ppUps, ivs, evs, contest, sheen, returnedHeldItem: returnedHeldItem || undefined, experience, makePartyRoom, evolutionMethod, ...overrides };
  }
  function confirmShedinjaRoom() {
    if (!shedinjaChoice || shedinjaChoice.fulfillment?.kind !== "level") return;
    const action = shedinjaChoice.fulfillment;
    const applied = onSubmit(buildDraft({ level: action.level, experience: action.experience, makePartyRoom: true, evolutionMethod: shedinjaChoice.method }));
    if (!applied) return;
    setFormHistory([]);
    setLevel(action.level); setExperience(action.experience); setSelectedEvolution({ target: shedinjaChoice.target, method: shedinjaChoice.method }); setEvolutionMethod(shedinjaChoice.method); setMakePartyRoom(false); setReturnedHeldItem(0);
    showPopup(`${nickname.trim() || editor.speciesName(speciesId)} is now 1 EXP point away from evolving, and the 6th party member was moved to the PC`);
    setShedinjaChoice(null);
  }
  function submitPokemon() {
    const applied = onSubmit(buildDraft());
    if (applied) { setFormHistory([]); setReturnedHeldItem(0); setMakePartyRoom(false); setEvolutionMethod(undefined); }
  }
  const evTotal = evs.reduce((total, value) => total + value, 0);
  const levelStartExperience = editor.experienceAtLevel(speciesId, level), nextLevelExperience = level < 100 ? editor.experienceAtLevel(speciesId, level + 1) : levelStartExperience;
  const experienceNeeded = Math.max(0, nextLevelExperience - levelStartExperience), experienceProgress = clamp((experience ?? levelStartExperience) - levelStartExperience, 0, Math.max(0, experienceNeeded - 1));
  const branchedEvolution = new Set(evolutionOptions.map(option => option.target)).size > 1;
  const selectedEvolutionOption = selectedEvolution ? evolutionOptions.find(option => option.target === selectedEvolution.target && option.method === selectedEvolution.method) : undefined;
  return <article className="card add-form">{popup && <div className="item-popup" role="status">{popup}</div>}{choiceOpen && <div className="modal-backdrop" role="presentation"><section className="evolution-modal" role="dialog" aria-modal="true" aria-labelledby="evolution-choice-title"><h3 id="evolution-choice-title">Choose an evolution path</h3><p>{branchedEvolution ? "Choose which Pokémon to prepare for." : `Choose how to prepare ${nickname || editor.speciesName(speciesId)}.`}</p><div className={`evolution-choice-grid ${branchedEvolution ? "branched" : "methods"}`}>{evolutionOptions.map((option, index) => <button type="button" className="evolution-choice" key={`${option.target}-${option.method}-${index}`} disabled={!option.fulfillment} onClick={() => chooseEvolution(option)}>{branchedEvolution && <PokemonSprite editor={editor} species={option.target} />}<strong>{branchedEvolution ? editor.speciesName(option.target) : option.choiceLabel}</strong>{branchedEvolution && <span className="choice-method">{option.choiceLabel}</span>}</button>)}</div><button type="button" className="secondary wide" onClick={() => setChoiceOpen(false)}>Cancel</button></section></div>}{shedinjaChoice && <div className="modal-backdrop" role="presentation"><section className="evolution-modal confirm-modal" role="dialog" aria-modal="true" aria-labelledby="shedinja-confirm-title"><h3 id="shedinja-confirm-title">Move 6th party member to PC for Shedinja?</h3><div className="confirm-actions"><button type="button" className="secondary" onClick={() => { applyEvolutionChoice(shedinjaChoice); setShedinjaChoice(null); }}>No</button><button type="button" className="primary" onClick={confirmShedinjaRoom}>Yes</button></div></section></div>}<div className="eyebrow">{location}</div><h2>{initial ? "Edit Pokémon" : "Add a Pokémon"}</h2>{initial ? <div className="evolution-summary">{evolutionOptions.length > 1 ? <div>Evolves multiple ways{selectedEvolutionOption?.status === "can" ? <> - <strong className="can-evolve">Can Evolve!</strong></> : selectedEvolutionOption?.status === "will" ? <> - <strong className="can-evolve">Will Evolve!</strong></> : <> - <button type="button" className="fulfill-evolution" onClick={() => setChoiceOpen(true)}>Fulfill?</button></>}</div> : evolutionOptions.length === 1 ? evolutionOptions.map((option, index) => <div key={`${option.text}-${index}`}>{option.text}{option.status === "can" ? <> - <strong className="can-evolve">Can Evolve!</strong></> : option.status === "will" ? <> - <strong className="can-evolve">Will Evolve!</strong></> : option.fulfillment ? <> - <button type="button" className="fulfill-evolution" onClick={() => requestFulfillment(option)}>Fulfill?</button></> : null}</div>) : "This Pokémon does not evolve."}</div> : <p>Create a new encrypted boxed Pokémon owned by this save’s trainer.</p>}
    <div className="sprite-stage"><PokemonSprite editor={editor} species={speciesId} shiny={shiny} className="large" /></div>
    <div className="form-grid">
      <label>Species<select value={speciesId} onChange={e => changeSpecies(Number(e.target.value))}>{species.map(entry => <option key={entry.id} value={entry.id}>{entry.name} · #{entry.id}</option>)}</select></label>
      <label>Nickname<input maxLength={10} value={nickname} onChange={e => { rememberForm(); setNickname(e.target.value); }} /></label>
      <label className="level-exp-field">Level<div className="level-exp-row"><input className="level-input" type="number" min="1" max="100" value={level} onChange={e => { rememberForm(); const nextLevel = clamp(Number(e.target.value), 1, 100); setLevel(nextLevel); setExperience(editor.experienceAtLevel(speciesId, nextLevel)); }} /><div className="exp-counter"><input aria-label="Experience earned this level" type="number" min="0" max={Math.max(0, experienceNeeded - 1)} disabled={level >= 100} value={experienceProgress} onChange={e => { rememberForm(); setExperience(levelStartExperience + clamp(Number(e.target.value), 0, Math.max(0, experienceNeeded - 1))); }} /><span>/ {experienceNeeded} EXP</span></div></div></label>
      <label>Nature<select value={nature} onChange={e => { rememberForm(); setNature(Number(e.target.value)); }}>{natureOptions.map(index => <option key={NATURES[index]} value={index}>{natureLabel(index)}</option>)}</select></label>
      <label>Gender<select value={gender} disabled={ratio === 0 || ratio >= 254} onChange={e => { rememberForm(); setGender(e.target.value as "M" | "F" | "N"); }}><option value="M">Male</option><option value="F">Female</option>{ratio === 255 && <option value="N">Genderless</option>}</select></label>
      <label>Ability<select value={abilitySlot} onChange={e => { rememberForm(); setAbilitySlot(Number(e.target.value) as AbilitySlot); }}>{abilities.map(ability => <option key={ability.slot} value={ability.slot}>{ability.name}{ability.hidden ? " (Hidden)" : ""}</option>)}</select></label>
      <label>Held item<select value={heldItem} onChange={e => { rememberForm(); const item = Number(e.target.value); setHeldItem(item); if (item === initial?.heldItem) setReturnedHeldItem(0); }}>{heldItems.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
      <label>Friendship<input type="number" min="0" max="255" value={friendship} onChange={e => { rememberForm(); setFriendship(clamp(Number(e.target.value), 0, 255)); }} /></label>
    </div>
    <label className="shiny-check"><input type="checkbox" checked={shiny} onChange={e => { rememberForm(); setShiny(e.target.checked); }} /> Shiny Pokémon</label>
    <h3>Moves</h3><div className="move-grid"><span /><span className="move-heading">PP</span><span className="move-heading">PP Ups</span>{moveIds.map((moveId, index) => <React.Fragment key={index}><select aria-label={`Move ${index + 1}`} value={moveId} onChange={e => changeMove(index, Number(e.target.value))}><option value={0}>—</option>{moveGroups.map(group => <optgroup label={group.label} key={group.label}>{group.moves.map(move => <option key={`${group.label}-${move.id}`} value={move.id}>{move.name}</option>)}</optgroup>)}</select><input aria-label={`Move ${index + 1} PP`} title="Current PP" type="number" min="0" max={editor.moveMaxPp(moveId, ppUps[index])} value={pp[index]} onChange={e => { rememberForm(); updateArray(setPp, index, clamp(Number(e.target.value), 0, editor.moveMaxPp(moveId, ppUps[index]))); }} /><input aria-label={`Move ${index + 1} PP Ups`} title="PP Ups used" type="number" min="0" max="3" value={ppUps[index]} onChange={e => changePpUps(index, Number(e.target.value))} /></React.Fragment>)}</div>
    <h3>IVs and EVs</h3><div className="stats-grid"><span />{DISPLAY_STATS.map(stat => <strong key={stat.label}>{stat.label}</strong>)}<span>IV</span>{DISPLAY_STATS.map(stat => <input aria-label={`${stat.name} IV`} key={`iv${stat.index}`} type="number" min="0" max="31" value={ivs[stat.index]} onChange={e => { rememberForm(); updateArray(setIvs,stat.index,clamp(Number(e.target.value),0,31)); }} />)}<span>EV</span>{DISPLAY_STATS.map(stat => { const value = evs[stat.index]; return <input aria-label={`${stat.name} EV`} key={`ev${stat.index}`} type="number" min="0" max={Math.min(252, Math.max(0, 510 - (evTotal - value)))} value={value} disabled={evTotal >= 510 && value === 0} onChange={e => updateEv(stat.index,Number(e.target.value))} />; })}</div><p className="ev-total">EV total: <strong>{evTotal} / 510</strong> · {Math.max(0, 510 - evTotal)} remaining</p>
    <h3>Contest Stats</h3><div className="contest-stats-grid"><span />{CONTEST_STATS.map(name => <strong key={name}>{name}</strong>)}<span>Value</span>{CONTEST_STATS.map((name, index) => <input className={`contest-${name.toLowerCase()}`} key={name} aria-label={`${name} contest stat`} type="number" min="0" max="255" value={contest[index]} onChange={e => { rememberForm(); updateArray(setContest, index, clamp(Number(e.target.value), 0, 255)); }} />)}</div>
    <button className="primary wide" onClick={submitPokemon}>{initial ? "Apply Pokémon Changes" : "Add Pokémon to Empty Slot"}</button>
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
  const [box, setBox] = useState(0), [pokemonSelection, setPokemonSelection] = useState<PokemonSelection | null>(null);
  const [undoStack, setUndoStack] = useState<UndoEntry[]>([]), [editorRevision, setEditorRevision] = useState(0), [formUndoAvailable, setFormUndoAvailable] = useState(false);
  const saveInput = useRef<HTMLInputElement>(null), romInput = useRef<HTMLInputElement>(null);
  const formUndo = useRef<(() => string) | null>(null);
  const registerFormUndo = useCallback((action: (() => string) | null) => { formUndo.current = action; setFormUndoAvailable(Boolean(action)); }, []);

  useEffect(() => {
    Promise.all([bufferStore("rom", "get"), LOCAL_SAVE_CACHE ? bufferStore("save", "get") : Promise.resolve(null)])
      .then(([storedRom, storedSave]) => {
        if (storedRom) setRom(storedRom);
        if (storedSave) { setSaveBuffer(storedSave); setSaveName(localStorage.getItem(CACHED_SAVE_NAME) || "cached_save_edited.sav"); }
        if (storedRom && storedSave) setNotice("Remembered local ROM and save ready.");
        else if (storedRom) setNotice("Remembered Seaglass ROM ready. Open a save to begin.");
        else if (storedSave) setNotice("Remembered local save ready. Choose the Seaglass ROM to begin.");
      }).catch(() => {});
  }, []);
  useEffect(() => { document.documentElement.dataset.theme = theme; localStorage.setItem("theme", theme); }, [theme]);
  useEffect(() => {
    if (!rom || !saveBuffer) return;
    try { const next = new SeaglassWebSave(saveBuffer, rom); setEditor(next); setUndoStack([]); setEditorRevision(current => current + 1); setPokemonSelection(null); setNotice(`Save ready · slot ${next.activeSlot ? "B" : "A"} · checksums ${next.verifyChecksums().length ? "need attention" : "OK"}`); }
    catch (error) { setEditor(null); setNotice(error instanceof Error ? error.message : "Could not open those files."); }
  }, [rom, saveBuffer]);

  const items = useMemo(() => editor?.editableItems() ?? [], [editor]);
  const selected = items.find(item => item.id === selectedId) ?? items[0];
  useEffect(() => { if (items.length && !items.some(item => item.id === selectedId)) setSelectedId(items[0].id); }, [items, selectedId]);
  useEffect(() => { if (editor && selected) setQuantity(editor.bagQuantity(selected.id, selected.pocket)); }, [editor, selected]);

  async function chooseRom(file?: File) {
    if (!file) return; const buffer = await file.arrayBuffer();
    try { await bufferStore("rom", "put", buffer); setRom(buffer); setNotice("ROM verified and remembered only in this browser."); }
    catch { setRom(buffer); setNotice("ROM loaded for this session."); }
  }
  async function chooseSave(file?: File) {
    if (!file) return;
    const buffer = await file.arrayBuffer(), outputName = file.name.replace(/\.(sav|srm)$/i, "") + "_edited.sav";
    setSaveName(outputName); setSaveBuffer(buffer);
    if (LOCAL_SAVE_CACHE) { localStorage.setItem(CACHED_SAVE_NAME, outputName); bufferStore("save", "put", buffer).catch(() => {}); }
  }
  function mutate(action: (current: SeaglassWebSave) => string) {
    if (!editor) return;
    const before = editor.data.slice().buffer as ArrayBuffer;
    try { const message = action(editor); setUndoStack(current => [...current, { data: before, selection: pokemonSelection, box, label: message }].slice(-20)); setEditor(Object.assign(Object.create(Object.getPrototypeOf(editor)), editor)); setEditorRevision(current => current + 1); setNotice(`${message} · checksums ${editor.verifyChecksums().length ? "BAD" : "OK"}`); }
    catch (error) { setNotice(error instanceof Error ? error.message : "The edit could not be applied."); }
  }
  function downloadSave() {
    if (!editor) return; const blob = new Blob([new Uint8Array(editor.data).buffer], { type: "application/octet-stream" }); const url = URL.createObjectURL(blob); const link = document.createElement("a"); link.href = url; link.download = saveName; link.click(); URL.revokeObjectURL(url);
  }
  function addPokemon(draft: NewPokemon) {
    if (!editor || pokemonSelection?.kind !== "empty") return false; const slot = pokemonSelection.index;
    const before = editor.data.slice().buffer as ArrayBuffer, label = `${editor.speciesName(draft.species)} added to Box ${Math.floor(slot / 30) + 1}, Slot ${slot % 30 + 1}`;
    try { editor.addBoxPokemon(slot, draft); setUndoStack(current => [...current, { data: before, selection: pokemonSelection, box, label }].slice(-20)); setEditor(Object.assign(Object.create(Object.getPrototypeOf(editor)), editor)); setEditorRevision(current => current + 1); setNotice(`${label} · checksums ${editor.verifyChecksums().length ? "BAD" : "OK"}`); setPokemonSelection({ kind: "box", index: slot }); return true; }
    catch (error) { setNotice(error instanceof Error ? error.message : "The Pokémon could not be added."); return false; }
  }
  function updatePokemon(draft: NewPokemon) {
    if (!editor || !pokemonSelection || pokemonSelection.kind === "empty") return false;
    const before = editor.data.slice().buffer as ArrayBuffer, previousSelection = pokemonSelection;
    try { const actualLocation = editor.updatePokemon(pokemonSelection, draft); const place = actualLocation.kind === "party" ? `Party Slot ${actualLocation.index + 1}` : `Box ${Math.floor(actualLocation.index / 30) + 1}, Slot ${actualLocation.index % 30 + 1}`, label = `${editor.speciesName(draft.species)} updated in ${place}`; setUndoStack(current => [...current, { data: before, selection: previousSelection, box, label }].slice(-20)); setEditor(Object.assign(Object.create(Object.getPrototypeOf(editor)), editor)); setEditorRevision(current => current + 1); setPokemonSelection(actualLocation); setNotice(`${label} · checksums ${editor.verifyChecksums().length ? "BAD" : "OK"}`); return true; }
    catch (error) { setNotice(error instanceof Error ? error.message : "The Pokémon could not be updated."); return false; }
  }
  function undo() {
    if (formUndo.current) { setNotice(formUndo.current()); return; }
    const entry = undoStack[undoStack.length - 1];
    if (!entry || !rom) return;
    try {
      const restored = new SeaglassWebSave(entry.data, rom); setEditor(restored); setUndoStack(current => current.slice(0, -1)); setPokemonSelection(entry.selection); setBox(entry.box); setEditorRevision(current => current + 1); setNotice(`Undid: ${entry.label} · checksums ${restored.verifyChecksums().length ? "BAD" : "OK"}`);
    } catch (error) { setNotice(error instanceof Error ? error.message : "The last edit could not be undone."); }
  }
  const selectedPokemon = editor && pokemonSelection && pokemonSelection.kind !== "empty" ? (pokemonSelection.kind === "party" ? editor.partyPokemon().find(mon => mon.location.index === pokemonSelection.index) ?? null : editor.boxPokemon(pokemonSelection.index)) : null;

  return <main className="shell">
    <header className="topbar">
      <div className="brand"><div><div className="title-row"><h1>Seaglass Save Editor</h1><img className="title-sprite" src="https://img.pokemondb.net/sprites/black-white/anim/shiny/beldum.gif" alt="Shiny Beldum animated sprite" /></div><p>Private, local, checksum-safe</p></div></div>
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
    <div className="tab-row">
      <nav className="tabs" aria-label="Editor sections">
        {([['auto','Auto Fills'],['pokemon','Pokémon'],['bag','Bag']] as [Tab,string][]).map(([id, label]) => <button key={id} className={tab === id ? "active" : ""} onClick={() => setTab(id)}>{label}</button>)}
      </nav>
      <button className="secondary undo-button" disabled={!formUndoAvailable && !undoStack.length} title={formUndoAvailable ? "Undo the last Pokémon form change" : undoStack.length ? `Undo ${undoStack[undoStack.length - 1].label}` : "Nothing to undo"} onClick={undo}>Undo</button>
    </div>

    <section className="workspace">
      {!editor && <div className="empty"><div className="empty-gem">◇</div><h2>Bring your own save</h2><p>Your ROM is remembered locally after the first selection. Saves always remain on your device.</p><button className="primary" onClick={() => rom ? saveInput.current?.click() : romInput.current?.click()}>{rom ? "Open a save" : "Load Seaglass ROM"}</button></div>}
      {editor && tab === "auto" && <div className="cards">
        <article className="card"><div className="eyebrow">Items & Poké Balls</div><h2>Stock the essentials</h2><p>Sets six selected Balls and six essentials to 99 in the Bag. The other 21 Ball types go to PC storage. Existing stacks are updated, never added past 99.</p><button className="primary wide" onClick={() => mutate(e => { e.applyEssentialsPreset(); return "Essentials and all Balls updated"; })}>Add 99 Essentials + All Balls</button></article>
        <article className="card"><div className="eyebrow">Technical Machines</div><h2>All TMs</h2><p>Sets each of Seaglass's 60 curated TMs, TM01 through TM60, to 99 in the TM pocket. HMs are left unchanged.</p><button className="primary wide" onClick={() => mutate(e => { const count = e.addAllTms(); return `${count} TMs set to 99`; })}>Add 99 of All TMs</button></article>
        <article className="card"><div className="eyebrow">Berry Pocket</div><h2>All Berries</h2><p>Sets all 68 Berries defined by Seaglass to 99 in the Berry pocket, including the later-generation resistance and event Berries.</p><button className="primary wide" onClick={() => mutate(e => { const count = e.addAllBerries(); return `${count} Berries set to 99`; })}>Add 99 of All Berries</button></article>
        <article className="card"><div className="eyebrow">Battle Items</div><h2>All Z-Crystals</h2><p>Adds one of each of the 35 type-specific and species-specific Z-Crystals to the Items pocket. Existing copies are updated to one.</p><button className="primary wide" onClick={() => mutate(e => { const count = e.addAllZCrystals(); return `${count} Z-Crystals set to 1`; })}>Add All Z-Crystals</button></article>
        <article className="card"><div className="eyebrow">Pokémon IVs</div><h2>Perfect every Pokémon</h2><p>Sets all six IVs to 31 for every party and boxed Pokémon. Party battle stats are recalculated from the selected Seaglass ROM.</p><button className="primary wide" onClick={() => mutate(e => { const count = e.maxAllIvs(); return `Maxed IVs for ${count.party} party and ${count.boxed} boxed Pokémon`; })}>Max IVs for All Pokémon</button></article>
        <article className="card"><div className="eyebrow">Party Levels</div><h2>Raise party to the level cap</h2><p>Your badge progress sets the current cap to Level {editor.currentLevelCap()}. Pokémon below the cap are raised to it; Pokémon already at or above it are left unchanged.</p><button className="primary wide" onClick={() => mutate(e => { const result = e.raisePartyToLevelCap(); return `Raised ${result.raised} party Pokémon to Level ${result.cap}; ${result.unchanged} already at or above cap`; })}>Raise Party to Level {editor.currentLevelCap()}</button></article>
      </div>}
      {editor && tab === "bag" && <div className="single-card"><article className="card"><div className="eyebrow">Bag quantities</div><h2>Add or update an item</h2><div className="form-row"><label>Item<select value={selected?.id ?? 0} onChange={e => setSelectedId(Number(e.target.value))}>{items.map(item => <option key={item.id} value={item.id}>{item.name} · {item.pocket === "balls" ? "Balls" : "Items"}</option>)}</select></label><label>Quantity<input type="number" min="0" max="99" value={quantity} onChange={e => setQuantity(Number(e.target.value))} /></label></div><p className="current">Current quantity: {selected ? editor.bagQuantity(selected.id, selected.pocket) : 0}</p><button className="primary" disabled={!selected} onClick={() => selected && mutate(e => { e.setBagQuantity(selected.id, quantity, selected.pocket); return `${selected.name} set to ${Math.max(0, Math.min(99, quantity))}`; })}>Add / Update Item</button></article></div>}
      {editor && tab === "pokemon" && <div className="pokemon-layout"><article className="card box-browser"><div className="eyebrow">Pokémon storage</div><h2>Party</h2><p>Select any Pokémon to edit it.</p><div className="party-grid">{editor.partyPokemon().map(mon => <button key={mon.location.index} className={pokemonSelection?.kind === "party" && pokemonSelection.index === mon.location.index ? "selected" : ""} onClick={() => setPokemonSelection(mon.location)}><PokemonSprite editor={editor} species={mon.species} shiny={mon.shiny} /><span>Slot {mon.location.index + 1} · Lv{mon.level}</span><strong>{editor.speciesName(mon.species)}</strong><small>{mon.nickname}</small></button>)}</div><div className="box-heading"><h2>Box {box + 1}</h2><select aria-label="PC Box" value={box} onChange={e => { setBox(Number(e.target.value)); setPokemonSelection(null); }}>{Array.from({length:14},(_,index) => <option value={index} key={index}>Box {index + 1}</option>)}</select></div><p>Select an occupied slot to edit it or an empty slot to add a Pokémon.</p><div className="box-grid">{editor.boxSlots(box).map((slot, index) => <button key={slot.index} className={`${slot.occupied ? "occupied" : "empty-slot"} ${pokemonSelection?.kind !== "party" && pokemonSelection?.index === slot.index ? "selected" : ""}`} onClick={() => setPokemonSelection({ kind: slot.occupied ? "box" : "empty", index: slot.index })}>{slot.occupied ? <PokemonSprite editor={editor} species={slot.species} shiny={slot.shiny} /> : <span className="add-mark">+</span>}<span>{index + 1}{slot.occupied ? ` · Lv${slot.level}` : " · Empty"}</span><strong>{slot.name}</strong>{slot.occupied && <small>{slot.nickname}</small>}</button>)}</div></article>{!pokemonSelection ? <article className="card slot-help"><h2>Select a Pokémon or empty slot</h2><p>Party and occupied box slots open the full editor. Empty box slots open the Add Pokémon form.</p></article> : pokemonSelection.kind === "empty" ? <PokemonForm key={`empty-${pokemonSelection.index}-${editorRevision}`} editor={editor} location={`Box ${Math.floor(pokemonSelection.index / 30) + 1} · Slot ${pokemonSelection.index % 30 + 1}`} onSubmit={addPokemon} registerUndo={registerFormUndo} /> : selectedPokemon ? <PokemonForm key={`${pokemonSelection.kind}-${pokemonSelection.index}-${editorRevision}`} editor={editor} location={pokemonSelection.kind === "party" ? `Party · Slot ${pokemonSelection.index + 1}` : `Box ${Math.floor(pokemonSelection.index / 30) + 1} · Slot ${pokemonSelection.index % 30 + 1}`} initial={selectedPokemon} onSubmit={updatePokemon} registerUndo={registerFormUndo} /> : null}</div>}
    </section>
    <footer>
      <span>{notice}</span>
      <span className="credits"><span>by phantomsafe</span><span>original by Ehsan516</span></span>
      <span>{saveBuffer ? saveName : "No save open"}</span>
    </footer>
  </main>;
}

createRoot(document.getElementById("root")!).render(<React.StrictMode><App /></React.StrictMode>);
