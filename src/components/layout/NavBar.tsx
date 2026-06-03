'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import styles from './NavBar.module.css';

import { useAudioMapStore } from '@/store/audioMapStore';
import { useEffect } from 'react';

export default function NavBar() {
  const pathname = usePathname();
  const { loadFromJson, exportToJson } = useAudioMapStore();

  useEffect(() => {
    // Auto-load on mount
    const saved = localStorage.getItem('umwelt_autosave');
    if (saved) {
      loadFromJson(saved);
    }

    // Global Cmd+S manual save
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 's') {
        e.preventDefault();
        const jsonStr = exportToJson();
        
        // Save to localStorage just in case
        localStorage.setItem('umwelt_autosave', jsonStr);
        
        // Trigger download
        const blob = new Blob([jsonStr], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `umwelt_patch_${new Date().toISOString().slice(0,10)}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      }
    };
    
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [loadFromJson, exportToJson]);

  const links = [
    { href: '/', label: 'HOME' },
    { href: '/physical', label: 'PHYSICAL VIEW' },
    { href: '/mirror', label: 'MIRROR SPACE' },
    { href: '/streams', label: 'STREAM MANAGER' },
    { href: '/audio', label: 'AUDIO EDITOR' },
    { href: '/experience', label: 'EXPERIENCE' },
    { href: '/collective', label: 'COLLECTIVE' },
  ];

  return (
    <nav className={styles.navbar}>
      <div className={styles.logo}>UMWELT</div>
      <div className={styles.links}>
        {links.map((link) => (
          <Link 
            key={link.href} 
            href={link.href}
            className={`${styles.link} ${pathname === link.href ? styles.active : ''}`}
          >
            {link.label}
          </Link>
        ))}
      </div>
    </nav>
  );
}
