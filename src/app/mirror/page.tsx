import MirrorSpaceScene from '@/components/MirrorSpaceScene';

export const metadata = {
  title: 'Umwelt | Mirror Space',
};

export default function MirrorPage() {
  return (
    <main style={{ width: '100vw', height: '100vh', overflow: 'hidden' }}>
      <MirrorSpaceScene />
    </main>
  );
}
