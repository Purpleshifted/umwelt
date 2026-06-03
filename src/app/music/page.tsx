'use client';

import dynamic from 'next/dynamic';

// Import the ReactFlow scene dynamically to avoid SSR issues with XYFlow
const MusicLibraryScene = dynamic(() => import('@/components/MusicLibraryScene'), {
  ssr: false,
});

export default function MusicLibraryPage() {
  return (
    <main style={{ width: '100vw', height: '100vh', overflow: 'hidden' }}>
      <MusicLibraryScene />
    </main>
  );
}
