import styles from './page.module.css';
import { useMusicStore, MusicModuleType } from '@/store/musicStore';
import { useAudioMapStore } from '@/store/audioMapStore';
import { useState } from 'react';

export default function MusicLibraryPage() {
  const { modules, addModule, updateModule, removeModule } = useMusicStore();
  const { virtualStreams } = useAudioMapStore();

  const handleAddModule = (type: MusicModuleType) => {
    addModule({
      id: `music_mod_${Date.now()}`,
      name: type === 'magenta_ai' ? 'Magenta Composer' : 'Harmonic Array',
      type,
      inputStreamId: null,
      harmonicConfig: type === 'harmonic_array' ? {
        scaleType: 'dorian',
        rootNote: 60,
        octaveRange: 2
      } : undefined,
      magentaConfig: type === 'magenta_ai' ? {
        temperatureMin: 0.1,
        temperatureMax: 1.5,
        density: 0.8
      } : undefined
    });
  };

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <h1>Music Library</h1>
        <p>Map physiological streams to generative music models (Harmonic Arrays or Magenta AI).</p>
      </header>

      <div className={styles.toolbar}>
        <button className={styles.btn} onClick={() => handleAddModule('harmonic_array')}>
          + Add Harmonic Array
        </button>
        <button className={styles.btn} onClick={() => handleAddModule('magenta_ai')}>
          + Add Magenta Composer
        </button>
      </div>

      <div className={styles.grid}>
        {modules.length === 0 ? (
          <div className={styles.empty}>No music modules defined. Add one above.</div>
        ) : (
          modules.map(mod => (
            <div key={mod.id} className={styles.moduleCard}>
              <div className={styles.cardHeader}>
                <h3>{mod.name}</h3>
                <button className={styles.deleteBtn} onClick={() => removeModule(mod.id)}>×</button>
              </div>

              <div className={styles.field}>
                <label>Driving Stream (Concentration / Excitement)</label>
                <select 
                  value={mod.inputStreamId || ''}
                  onChange={(e) => updateModule(mod.id, { inputStreamId: e.target.value || null })}
                >
                  <option value="">-- Select Stream --</option>
                  {virtualStreams.map(vs => (
                    <option key={vs.id} value={vs.id}>{vs.name}</option>
                  ))}
                </select>
              </div>

              {mod.type === 'harmonic_array' && mod.harmonicConfig && (
                <div className={styles.configArea}>
                  <div className={styles.field}>
                    <label>Scale Type</label>
                    <select 
                      value={mod.harmonicConfig.scaleType}
                      onChange={(e) => updateModule(mod.id, { 
                        harmonicConfig: { ...mod.harmonicConfig!, scaleType: e.target.value as any } 
                      })}
                    >
                      <option value="major">Major</option>
                      <option value="minor">Minor</option>
                      <option value="dorian">Dorian</option>
                      <option value="altered">Altered</option>
                    </select>
                  </div>
                  <div className={styles.field}>
                    <label>Octave Range</label>
                    <input 
                      type="range" min="1" max="4" 
                      value={mod.harmonicConfig.octaveRange}
                      onChange={(e) => updateModule(mod.id, { 
                        harmonicConfig: { ...mod.harmonicConfig!, octaveRange: parseInt(e.target.value) } 
                      })}
                    />
                    <span>{mod.harmonicConfig.octaveRange}</span>
                  </div>
                </div>
              )}

              {mod.type === 'magenta_ai' && mod.magentaConfig && (
                <div className={styles.configArea}>
                  <div className={styles.field}>
                    <label>Max Temperature (Tension)</label>
                    <input 
                      type="range" min="0.5" max="2.0" step="0.1"
                      value={mod.magentaConfig.temperatureMax}
                      onChange={(e) => updateModule(mod.id, { 
                        magentaConfig: { ...mod.magentaConfig!, temperatureMax: parseFloat(e.target.value) } 
                      })}
                    />
                    <span>{mod.magentaConfig.temperatureMax}</span>
                  </div>
                </div>
              )}

              <div className={styles.outputs}>
                <p><strong>Outputs Available for Audio Engine:</strong></p>
                <ul>
                  <li><code>{mod.id}_pitch</code> (Freq Hz)</li>
                  <li><code>{mod.id}_gate</code> (0 or 1)</li>
                </ul>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
