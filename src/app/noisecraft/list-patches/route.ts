import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

export async function GET() {
  try {
    const examplesDir = path.join(process.cwd(), 'public', 'noisecraft', 'public', 'examples');
    if (!fs.existsSync(examplesDir)) {
      return NextResponse.json({ patches: [] });
    }
    const files = fs.readdirSync(examplesDir);
    const patches = files
      .filter(f => f.endsWith('.ncft'))
      .map(filename => {
        const stats = fs.statSync(path.join(examplesDir, filename));
        return { filename, lastModified: stats.mtimeMs };
      })
      .sort((a, b) => b.lastModified - a.lastModified);
    return NextResponse.json({ patches });
  } catch (err) {
    console.error('Error listing patches:', err);
    return NextResponse.json({ patches: [] });
  }
}
