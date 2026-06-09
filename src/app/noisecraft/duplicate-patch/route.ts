import { NextResponse } from 'next/server';
import fs from 'fs/promises';
import path from 'path';

export async function POST(request: Request) {
  try {
    const { sourceFile, newName } = await request.json();
    if (!sourceFile || !newName) return NextResponse.json({ error: 'Source and new name are required' }, { status: 400 });

    let safeNew = newName.trim().replace(/\s+/g, '_');
    if (!safeNew.endsWith('.ncft')) safeNew += '.ncft';

    const sourcePublicPath = path.join(process.cwd(), 'public', 'noisecraft', 'public', 'examples', sourceFile);
    const newPublicPath = path.join(process.cwd(), 'public', 'noisecraft', 'public', 'examples', safeNew);
    
    try { await fs.copyFile(sourcePublicPath, newPublicPath); } catch (e) {}

    const sourceSourcePath = path.join(process.cwd(), 'noisecraft', 'examples', sourceFile);
    const newSourcePath = path.join(process.cwd(), 'noisecraft', 'examples', safeNew);
    
    try { await fs.copyFile(sourceSourcePath, newSourcePath); } catch (e) {}

    return NextResponse.json({ success: true, filename: safeNew });
  } catch (err) {
    console.error('Error duplicating patch:', err);
    return NextResponse.json({ error: 'Failed to duplicate patch' }, { status: 500 });
  }
}
