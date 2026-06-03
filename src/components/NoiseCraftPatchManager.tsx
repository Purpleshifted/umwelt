'use client';

import React, { useEffect, useState } from 'react';
import styles from './NoiseCraftPatchManager.module.css';

interface Patch {
  filename: string;
  title: string;
  size: number;
  modified: string;
}

interface Props {
  onSelectPatch: (filename: string) => void;
}

export default function NoiseCraftPatchManager({ onSelectPatch }: Props) {
  const [patches, setPatches] = useState<Patch[]>([]);
  const [loading, setLoading] = useState(true);
  const [newPatchName, setNewPatchName] = useState('');
  const [creating, setCreating] = useState(false);

  const fetchPatches = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/noisecraft/list-patches?t=${Date.now()}`, { cache: 'no-store' });
      if (res.ok) {
        const data = await res.json();
        setPatches(data.patches || []);
      }
    } catch (err) {
      console.error('Failed to fetch patches', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPatches();
  }, []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPatchName.trim()) return;
    setCreating(true);
    try {
      const res = await fetch('/noisecraft/create-patch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newPatchName.trim() }),
      });
      if (res.ok) {
        const data = await res.json();
        setNewPatchName('');
        await fetchPatches();
        onSelectPatch(data.filename);
      } else {
        const err = await res.json();
        alert('Failed to create patch: ' + err.error);
      }
    } catch (err) {
      console.error(err);
      alert('Network error while creating patch');
    } finally {
      setCreating(false);
    }
  };

  const handleDuplicate = async (e: React.MouseEvent, sourceFile: string) => {
    e.stopPropagation();
    const newName = prompt(`Enter name for duplicate of ${sourceFile}:`, `${sourceFile.replace('.ncft', '')}_copy`);
    if (!newName) return;
    
    setLoading(true);
    try {
      const res = await fetch('/noisecraft/duplicate-patch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sourceFile, newName: newName.trim() }),
      });
      if (res.ok) {
        await fetchPatches();
      } else {
        const err = await res.json();
        alert('Failed to duplicate patch: ' + err.error);
      }
    } catch (err) {
      console.error(err);
      alert('Network error while duplicating patch');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h2>NoiseCraft Patches</h2>
        <p>Select a patch to edit, or create a new one.</p>
      </div>

      <div className={styles.createSection}>
        <form onSubmit={handleCreate}>
          <input
            type="text"
            placeholder="New Patch Name..."
            value={newPatchName}
            onChange={(e) => setNewPatchName(e.target.value)}
            disabled={creating}
            className={styles.input}
          />
          <button type="submit" disabled={!newPatchName.trim() || creating} className={styles.btn}>
            {creating ? 'Creating...' : '+ Create Patch'}
          </button>
        </form>
      </div>

      <div className={styles.patchList}>
        {loading ? (
          <div className={styles.loading}>Loading patches...</div>
        ) : patches.length === 0 ? (
          <div className={styles.empty}>No patches found.</div>
        ) : (
          patches.map((patch) => (
            <div key={patch.filename} className={styles.patchCard} onClick={() => onSelectPatch(patch.filename)}>
              <div className={styles.patchIcon}>🎹</div>
              <div className={styles.patchInfo}>
                <div className={styles.patchTitle}>{patch.title || patch.filename.replace('.ncft', '')}</div>
                <div className={styles.patchMeta}>
                  {patch.filename} • {(patch.size / 1024).toFixed(1)} KB
                </div>
              </div>
              <div className={styles.patchActions}>
                <button 
                  className={styles.duplicateBtn} 
                  onClick={(e) => handleDuplicate(e, patch.filename)}
                  title="Duplicate this patch"
                >
                  ⧉
                </button>
                <button className={styles.openBtn}>Edit</button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
