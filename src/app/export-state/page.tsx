'use client';

import { useEffect, useState } from 'react';

export default function ExportStatePage() {
  const [status, setStatus] = useState('Loading...');

  useEffect(() => {
    const musicRaw = localStorage.getItem('umwelt-music-storage');
    const audioMapRaw = localStorage.getItem('umwelt-audio-map-storage');
    const audioGraphRaw = localStorage.getItem('umwelt-audiograph-storage');

    const results: Record<string, any> = {};

    if (musicRaw) {
      const parsed = JSON.parse(musicRaw);
      results.music_library_state = {
        state: {
          modules: parsed.state?.modules || [],
          edges: parsed.state?.edges || [],
        }
      };
    }

    if (audioMapRaw) {
      const parsed = JSON.parse(audioMapRaw);
      results.stream_manager_state = {
        streams: parsed.state?.streams || [],
        mappings: parsed.state?.mappings || [],
      };
    }

    if (audioGraphRaw) {
      const parsed = JSON.parse(audioGraphRaw);
      results.audio_editor_state = {
        state: {
          nodes: parsed.state?.nodes || [],
          edges: parsed.state?.edges || [],
        }
      };
    }

    // Download each as a file
    for (const [name, data] of Object.entries(results)) {
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${name}.json`;
      a.click();
      URL.revokeObjectURL(url);
    }

    setStatus(`Exported ${Object.keys(results).length} state files. Check your downloads.`);
  }, []);

  return (
    <div style={{ padding: '100px 40px', color: '#fff', background: '#000', minHeight: '100vh', fontFamily: 'monospace' }}>
      <h1>State Exporter</h1>
      <p>{status}</p>
    </div>
  );
}
