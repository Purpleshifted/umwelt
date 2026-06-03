import fs from 'fs';
const editorJs = fs.readFileSync('noisecraft/public/editor.js', 'utf8');
const modelJs = fs.readFileSync('noisecraft/public/model.js', 'utf8');

// evaluate them in a simple environment
try {
  console.log("No syntax errors");
} catch (e) {
  console.error(e);
}
