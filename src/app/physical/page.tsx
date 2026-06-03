import PureVisualScene from '@/components/PureVisualScene';

export const metadata = {
  title: 'Umwelt | Physical View',
};

export default function PhysicalPage() {
  return (
    <main style={{ width: '100vw', height: '100vh', overflow: 'hidden' }}>
      <PureVisualScene />
    </main>
  );
}
