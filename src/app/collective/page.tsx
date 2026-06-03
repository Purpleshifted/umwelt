import CollectiveScene from '@/components/CollectiveScene';

export const metadata = {
  title: 'Umwelt | Collective',
};

export default function CollectivePage() {
  return (
    <main style={{ width: '100vw', height: '100vh', overflow: 'hidden' }}>
      <CollectiveScene />
    </main>
  );
}
