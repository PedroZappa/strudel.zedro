// src/client-app.ts
import '@strudel/repl';
import { repl, controls } from '@strudel/core';
import {
  initAudioOnFirstClick,
  getAudioContext,
  webaudioOutput
} from '@strudel/webaudio';
const { note } = controls;

// (0) Initialize AudioContext
initAudioOnFirstClick();

// (1) Wait until the custom element is defined and the DOM is ready
window.addEventListener('DOMContentLoaded', async () => {
  // (2) Create the REPL element
  const repl = document.createElement(
    'strudel-editor'
  ) as StrudelEditorElement;
  repl.width = window.innerWidth;
  repl.height = window.innerHeight;

  // (3) Set default strudel
  repl.setAttribute(
    'code',
    `
setcps(1)
n("<0 1 2 3 4>*8").scale('G4 minor')
  .s("gm_lead_6_voice")
  .clip(sine.range(.2,.8).slow(8))
  .jux(rev)
  .room(2)
  .sometimes(add(note("12")))
  .lpf(perlin.range(200,20000).slow(4))
`
  );
  // 
  // repl.setAttributeNode

  // (4) Mount it into the placeholder div
  document.getElementById('strudel')?.append(repl);

  // (5) Access the CodeMirror/Strudel API for dev
  console.log("Editor", repl.editor);

  // Add a play button or ensure the first audio action is user-initiated
  document.addEventListener('click', async () => {
    // This ensures audio context is created with user activation
    if (repl.editor) {
      repl.start(); // Only start audio after user gesture
    }
  }, { once: true });
});

// Check and handle AudioContext state
const handleAudioContextState = async (audioContext: AudioContext) => {
  if (audioContext.state === 'suspended') {
    await audioContext.resume();
  }
};


/* ------------------------------------------------------------------ */
/*  TypeScript: minimal typing so that `repl.editor` doesn’t error    */
/* ------------------------------------------------------------------ */
interface StrudelEditorElement extends HTMLElement {
  readonly editor: unknown;          // StrudelMirror instance
  width: number;
  height: number;
  setCode(code: string): void;
  start(): void;
  stop(): void;
  evaluate(): void;
}

declare global {
  interface HTMLElementTagNameMap {
    'strudel-editor': StrudelEditorElement;
  }
}

