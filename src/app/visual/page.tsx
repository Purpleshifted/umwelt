import PureVisualScene from '@/components/PureVisualScene';

export const metadata = {
  title: 'Umwelt | Pure Visuals',
};

export default function VisualPage() {
  return (
    <main style={{ width: '100vw', height: '100vh', overflow: 'hidden' }}>
      <PureVisualScene />
    </main>
  );
}
