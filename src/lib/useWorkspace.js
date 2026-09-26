import { useCallback, useEffect, useRef, useState } from 'react';
import { migrateLegacy, validateWorkspace } from './workspace';

const DB_NAME = 'vk-personal-workspace';
const STORE = 'workspace';
let databasePromise;
function openDatabase() {
  if (!databasePromise) databasePromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE);
    request.onsuccess = () => {
      const db = request.result;
      db.onversionchange = () => { db.close(); databasePromise = null; };
      resolve(db);
    };
    request.onerror = () => { databasePromise = null; reject(request.error); };
    request.onblocked = () => { databasePromise = null; reject(new Error('Another VK tab is blocking storage. Close it and retry.')); };
  });
  return databasePromise;
}
async function transactionRecord(mutator) {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite'); const store = tx.objectStore(STORE); const request = store.get('current');
    let next;
    request.onsuccess = () => {
      try { next = mutator(request.result); validateWorkspace(next); store.put(next, 'current'); } catch (error) { reject(error); tx.abort(); }
    };
    tx.oncomplete = () => resolve(next);
    tx.onerror = () => reject(tx.error || new Error('Your changes could not be saved. Check available device storage.'));
    tx.onabort = () => reject(tx.error || new Error('Save cancelled. Your input has been kept.'));
  });
}
async function loadDocument() {
  // Migration and initial save run in the same transaction; existing legacy keys
  // remain untouched so a failed migration never destroys the original records.
  return transactionRecord((stored) => stored ? validateWorkspace(stored) : migrateLegacy(localStorage));
}

export function useWorkspace() {
  const [data, setData] = useState(null); const [ready, setReady] = useState(false);
  const [error, setError] = useState(''); const [saving, setSaving] = useState(false);
  const queue = useRef(Promise.resolve()); const channel = useRef(null);
  const alive = useRef(true);
  const retry = useCallback(async () => {
    try { const doc = await loadDocument(); if (alive.current) { setData(doc); setReady(true); setError(''); } }
    catch (problem) { if (alive.current) setError(`Unable to open saved records. ${problem.message}`); }
  }, []);
  useEffect(() => {
    alive.current = true; retry();
    if ('BroadcastChannel' in window) { channel.current = new BroadcastChannel('vk-workspace-updates'); channel.current.onmessage = () => retry(); }
    const visible = () => { if (document.visibilityState === 'visible') retry(); };
    window.addEventListener('focus', visible);
    return () => { alive.current = false; channel.current?.close(); window.removeEventListener('focus', visible); };
  }, [retry]);
  const update = useCallback((mutator) => {
    const job = async () => {
      if (alive.current) setSaving(true);
      try {
        const next = await transactionRecord((stored) => {
          if (!stored) throw new Error('Saved workspace is unavailable. Reload before editing.');
          const draft = structuredClone(stored); mutator(draft); draft.updatedAt = new Date().toISOString(); return draft;
        });
        if (alive.current) { setData(next); setError(''); }
        channel.current?.postMessage({ updatedAt: next.updatedAt });
        return true;
      } catch (problem) { if (alive.current) setError(`Not saved. ${problem.message}`); return false; }
      finally { if (alive.current) setSaving(false); }
    };
    const result = queue.current.then(job, job); queue.current = result.then(() => undefined); return result;
  }, []);
  const importData = useCallback(async (text) => {
    try {
      if (text.length > 20 * 1024 * 1024) throw new Error('Backup is too large (20 MB maximum).');
      const imported = validateWorkspace(JSON.parse(text));
      // Serialize restore with edits so either transaction completes as a unit.
      return await update((draft) => { for (const key of Object.keys(draft)) delete draft[key]; Object.assign(draft, imported); });
    } catch (problem) { setError(problem.message); return false; }
  }, [update]);
  const exportData = useCallback(() => {
    if (!data) return;
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob); const anchor = document.createElement('a'); anchor.href = url; anchor.download = `vk-backup-${new Date().toISOString().slice(0, 10)}.json`; anchor.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  }, [data]);
  return { data, ready, error, saving, update, retry, exportData, importData };
}
