'use client';

import { useEffect, useState } from 'react';
import styles from '@/components/GlobalDashboard.module.css';

export default function ExportPage() {
  const [hasWindow, setHasWindow] = useState(false);

  useEffect(() => {
    setHasWindow(true);
  }, []);

  const downloadFile = (filename: string, data: string) => {
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleExport = (key: string, filename: string) => {
    const data = localStorage.getItem(key);
    if (!data) {
      alert(`No data found in localStorage for key: ${key}`);
      return;
    }
    downloadFile(filename, data);
  };

  if (!hasWindow) return null;

  return (
    <div style={{ padding: '50px', color: 'white', fontFamily: 'monospace' }}>
      <h1>Local Storage Exporter</h1>
      <p>Click the buttons below to export your saved states from this browser.</p>
      
      <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', marginTop: '30px' }}>
        <button 
          onClick={() => handleExport('umwelt_autosave', 'stream_manager_state.json')}
          style={{ padding: '10px 20px', cursor: 'pointer' }}
        >
          Export Stream Manager (umwelt_autosave)
        </button>

        <button 
          onClick={() => handleExport('umwelt-music-storage', 'music_library_state.json')}
          style={{ padding: '10px 20px', cursor: 'pointer' }}
        >
          Export Music Library (umwelt-music-storage)
        </button>

        <button 
          onClick={() => handleExport('umwelt-audiograph-storage', 'audio_editor_state.json')}
          style={{ padding: '10px 20px', cursor: 'pointer' }}
        >
          Export Audio Editor (umwelt-audiograph-storage)
        </button>
      </div>
    </div>
  );
}
