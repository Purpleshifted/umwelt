import AudioEditorScene from '@/components/AudioEditorScene';

export const metadata = {
  title: 'Umwelt | Audio Editor',
};

export default function AudioPage() {
  return (
    <main style={{ width: '100vw', height: '100vh', overflow: 'hidden' }}>
      <AudioEditorScene />
    </main>
  );
}
