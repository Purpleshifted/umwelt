'use client';

import Link from 'next/link';
import styles from './page.module.css';

export default function Home() {
  return (
    <main className={styles.main}>
      <div className={styles.background}>
        <div className={styles.gradient}></div>
      </div>
      
      <div className={styles.content}>
        <h1 className={styles.title}>UMWELT</h1>
        <p className={styles.subtitle}>Somatic Acoustic Sculpture</p>
        
        <p className={styles.description}>
          A sensory translation environment exploring the boundaries between physiological data and spatial acoustic architecture. Select a module to explore:
        </p>
        
        <div className={styles.navGrid}>
          <Link href="/physical" className={styles.navCard}>
            <h2>PHYSICAL VIEW</h2>
            <p>Explore the high-fidelity 3D rendering of the mirror phone booth installation.</p>
          </Link>
          
          <Link href="/mirror" className={styles.navCard}>
            <h2>MIRROR SPACE</h2>
            <p>Manually navigate an infinite point-grid representing the conceptual virtual dimension.</p>
          </Link>
          
          <Link href="/experience" className={styles.navCard}>
            <h2>EXPERIENCE</h2>
            <p>Interact with the biosensor-driven NoiseCraft audio synthesis engine.</p>
          </Link>
          
          <Link href="/collective" className={styles.navCard}>
            <h2>COLLECTIVE</h2>
            <p>The integrated pipeline combining visual architecture and dynamic acoustic sculpture.</p>
          </Link>
        </div>
      </div>
    </main>
  );
}
