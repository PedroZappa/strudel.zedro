// Wait for the web component to be loaded
document.addEventListener('DOMContentLoaded', function() {
  const strudelEditor = document.getElementById('strudelEditor');

  // Test functions for the controls
  window.testStrudelConnection = function() {
    if (strudelEditor && strudelEditor.editor) {
      console.log('Strudel Editor instance:', strudelEditor.editor);
      alert('✅ Strudel Editor is connected and ready!');
    } else {
      alert('❌ Strudel Editor not ready yet. Wait a moment and try again.');
    }
  };

  window.loadExample = function() {
    if (strudelEditor && strudelEditor.editor) {
      const exampleCode = `// Example pattern
setcps(120/4)
sound("bd*4, sd*2, [~ cp]*2")
  .gain(0.8)
  .room(0.2)
  .cutoff(sine.slow(4).range(300, 3000))`;

      strudelEditor.editor.setCode(exampleCode);
      strudelEditor.editor.evaluate();
    }
  };

  window.clearEditor = function() {
    if (strudelEditor && strudelEditor.editor) {
      strudelEditor.editor.setCode('');
    }
  };

  // Direct JavaScript access functions for external use
  window.sendCodeToStrudel = function(code) {
    if (strudelEditor && strudelEditor.editor) {
      strudelEditor.editor.setCode(code);
      strudelEditor.editor.evaluate();
      return true;
    }
    console.error('Strudel editor not available');
    return false;
  };

  window.stopStrudel = function() {
    if (strudelEditor && strudelEditor.editor) {
      strudelEditor.editor.stop();
      return true;
    }
    console.error('Strudel editor not available');
    return false;
  };

  window.startStrudel = function() {
    if (strudelEditor && strudelEditor.editor) {
      strudelEditor.editor.start();
      return true;
    }
    console.error('Strudel editor not available');
    return false;
  };
});

