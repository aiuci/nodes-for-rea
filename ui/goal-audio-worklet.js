// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Jeremy Opio
class GoalPCM extends AudioWorkletProcessor {
  process(inputs){const samples=inputs[0]?.[0];if(samples){const chunk=new Float32Array(samples);this.port.postMessage(chunk.buffer,[chunk.buffer]);}return true;}
}
registerProcessor('goal-pcm',GoalPCM);
