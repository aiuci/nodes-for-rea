// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Jeremy Opio
/**
 * Jeremy's Spectrum — Jeremy's authored BEAT color progression.
 * Extracted from Scope Logic V1.6 Portable, ScopeLogicRunnerApp/inject.js.
 * Pure color functions only; no application styling or allocation policy.
 */
export const JEREMYS_SPECTRUM = Object.freeze({
  name: "Jeremy's Spectrum",
  hueStart: 330,
  hueEnd: 40,
  saturation: 100,
  lightnessBase: 60,
  lightnessLift: 6,
});

// Preserve the original arithmetic, denominator and CSS string exactly.
// Normal BEAT indexes are zero-based and stop before totalBeats.
export function jeremysSpectrumColor(beatIndex, totalBeats) {
  const maxSteps = Math.max(totalBeats, 1);
  const t = beatIndex / maxSteps;
  const hue = 330 - (t * 290);
  const sat = 100;
  const light = 60 + Math.sin(t * Math.PI) * 6;
  return `hsl(${hue}, ${sat}%, ${light}%)`;
}

// Preserve updateBeat's active/running complement, independently of the base.
export function jeremysSpectrumRunningColor(beatIndex, totalBeats) {
  const maxSteps = Math.max(totalBeats, 1);
  const t = beatIndex / maxSteps;
  const doneHue = 330 - (t * 290);
  const compHue = (doneHue + 180) % 360;
  return `hsl(${compHue}, 90%, 65%)`;
}

// The original tool/audit-pill variant uses 14 positions and rounds hue.
// It is a separate consumer variant, not the BEAT-result color function.
export function jeremysSpectrumPillHue(index) {
  const TOTAL_PILLS = 14;
  return Math.round(330 - (index / TOTAL_PILLS) * 290);
}

/**
 * Sample the existing continuous BEAT curve at a retained position in [0,1].
 * This wrapper introduces no new hue curve or fixed list of colors.
 * Choosing, retaining and extending positions is a separate REA design choice.
 */
export function sampleJeremysSpectrum(position) {
  if (!Number.isFinite(position) || position < 0 || position > 1) {
    throw new RangeError('Spectrum position must be a finite number from 0 to 1.');
  }
  return jeremysSpectrumColor(position, 1);
}

// REA's closed-loop presentation retains the authored BEAT curve, then adds
// the missing amber→orange→red→pink seam. The source formulas above stay intact.
export function sampleLoopingJeremysSpectrum(position) {
  if(!Number.isFinite(position))throw new RangeError('Spectrum position must be finite.');
  const phase=((position%1)+1)%1,hue=330-phase*360,authoredEnd=290/360;
  const light=phase<=authoredEnd?60+Math.sin(phase/authoredEnd*Math.PI)*6:60;
  return `hsl(${hue}, 100%, ${light}%)`;
}
export const SPECTRUM_BEAT=14.5/360; // One intermediary between original 29° anchors.
export function assignLoopingNodeSpectrum(map,previous={}) {
  const colors={...previous},queue=[map.root],seen=new Set();colors[map.root]??=0;
  while(queue.length){const parent=queue.shift();if(seen.has(parent))continue;seen.add(parent);
    for(const [index,id]of (map.children.get(parent)||[]).entries()){
      colors[id]??=((colors[parent]+(index+(parent===map.root?0:1))*SPECTRUM_BEAT)%1+1)%1;queue.push(id);
    }
  }
  return colors;
}
