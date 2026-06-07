const qpm = 120;
const stepTime = 60 / qpm / 4; // 0.125
console.log("stepTime:", stepTime);

// Imagine unquantized notes from Magenta:
const notes = [
  { startTime: 0.125, endTime: 0.25, pitch: 64 },
  { startTime: 0.375, endTime: 0.5, pitch: 65 }
];

for(let i=0; i<8; i++) {
  const stepStart = i * stepTime;
  const note = notes.find(n => n.startTime <= stepStart + 0.01 && n.endTime > stepStart);
  console.log(`step ${i} (start: ${stepStart}): note found?`, !!note);
}
