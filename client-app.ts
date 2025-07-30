// src/client-app.ts
import '@strudel/repl';

// (1) Wait until the custom element is defined and the DOM is ready
window.addEventListener('DOMContentLoaded', () => {
  // (2) Create the REPL element
  const repl = document.createElement(
    'strudel-editor'
  ) as StrudelEditorElement;

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

  // (4) Mount it into the placeholder div
  document.getElementById('strudel')?.append(repl);

  // (5) Access the CodeMirror/Strudel API for dev
  console.log(repl.editor);
});

/* ------------------------------------------------------------------ */
/*  TypeScript: minimal typing so that `repl.editor` doesn’t error    */
/* ------------------------------------------------------------------ */
interface StrudelEditorElement extends HTMLElement {
  readonly editor: unknown;          // StrudelMirror instance
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

