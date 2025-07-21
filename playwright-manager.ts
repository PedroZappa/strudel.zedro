// playwright-manager.ts - Fixed version with better error handling and direct code injection

import type { Browser, Page, BrowserContext } from 'playwright';
import { chromium } from 'playwright';

export class PlaywrightManager {
  private browser?: Browser;
  private context?: BrowserContext;
  private page?: Page;
  private strudelUrl: string;
  private isInitialized = false;

  constructor(strudelUrl: string) {
    this.strudelUrl = strudelUrl;
  }

  async initialize(): Promise<boolean> {
    try {
      console.log('🚀 Initializing Playwright browser...');

      this.browser = await chromium.launch({
        headless: false,  // Keep visible for debugging
        args: ['--no-sandbox', '--disable-setuid-sandbox']
      });

      this.context = await this.browser.newContext({
        viewport: { width: 1280, height: 720 }
      });

      this.page = await this.context.newPage();

      // Set longer timeout for initial page load
      this.page.setDefaultTimeout(60000);

      // Navigate to Strudel REPL
      console.log(`📱 Navigating to ${this.strudelUrl}/strudel`);
      await this.page.goto(`${this.strudelUrl}/strudel`);

      // Wait for Strudel REPL to be ready
      await this.waitForStrudelReady();

      this.isInitialized = true;
      console.log('✅ Playwright browser ready and targeting Strudel REPL');

      return true;
    } catch (error) {
      console.error('❌ Failed to initialize Playwright:', error);
      await this.cleanup();
      return false;
    }
  }

  private async waitForStrudelReady(): Promise<void> {
    if (!this.page) throw new Error('Page not initialized');

    try {
      // Wait for CodeMirror editor to be present
      console.log('⏳ Waiting for Strudel REPL to load...');

      const REPL_SELECTOR = [
        'strudel-repl >>> .cm-editor',
        'strudel-repl >>> .CodeMirror',
        'iframe[src*="strudel"] >> .cm-editor',
        'iframe[src*="strudel"] >> .CodeMirror',
        'strudel-editor >>> .cm-editor'
      ].join(', ');
      
      // Wait for either CodeMirror v5 or v6 editor
      await this.page.waitForSelector(REPL_SELECTOR, { timeout: 30000 });

      // Additional wait for Strudel context to be ready
      await this.page.waitForFunction(() => {
        return typeof window !== 'undefined' &&
          (window.hasOwnProperty('repl') ||
            document.querySelector('.cm-editor, .CodeMirror'));
      }, { timeout: 30000 });

      console.log('✅ Strudel REPL is ready');

    } catch (error) {
      console.error('❌ Strudel REPL failed to load properly:', error);
      throw error;
    }
  }

  async sendCodeToStrudel(code: string): Promise<boolean> {
    if (!this.isInitialized || !this.page) {
      console.error('❌ Playwright not initialized');
      return false;
    }

    try {
      console.log('📤 Sending code to Strudel REPL...');
      console.log(`Code length: ${code.length} characters`);

      // SOLUTION: Use JavaScript evaluation instead of clicking
      // This bypasses any modal/overlay issues completely
      const success = await this.page.evaluate((codeToSet) => {
        try {
          // Method 1: Try CodeMirror 6 (newer Strudel versions)
          const cmEditor = document.querySelector('.cm-editor');
          if (cmEditor && cmEditor.cmView) {
            const view = cmEditor.cmView.view;
            view.dispatch({
              changes: {
                from: 0,
                to: view.state.doc.length,
                insert: codeToSet
              }
            });
            return true;
          }

          // Method 2: Try CodeMirror 5 (older versions)
          const cmLegacy = document.querySelector('.CodeMirror');
          if (cmLegacy && cmLegacy.CodeMirror) {
            cmLegacy.CodeMirror.setValue(codeToSet);
            return true;
          }

          // Method 3: Try accessing global Strudel REPL object
          if (window.repl && window.repl.editor) {
            window.repl.editor.setValue(codeToSet);
            return true;
          }

          // Method 4: Try strudel-editor web component
          const strudelEditor = document.querySelector('strudel-editor');
          if (strudelEditor && strudelEditor.editor) {
            strudelEditor.editor.setCode(codeToSet);
            return true;
          }

          console.error('No suitable CodeMirror instance found');
          return false;

        } catch (err) {
          console.error('Error setting code:', err);
          return false;
        }
      }, code);

      if (success) {
        console.log('✅ Code successfully sent to Strudel');
        return true;
      } else {
        console.error('❌ Failed to set code in Strudel editor');
        return false;
      }

    } catch (error) {
      console.error('❌ Failed to send code to Strudel:', error);
      return false;
    }
  }

  async stopStrudel(): Promise<boolean> {
    if (!this.isInitialized || !this.page) {
      console.error('❌ Playwright not initialized');
      return false;
    }

    try {
      console.log('⏹️ Stopping Strudel playback...');

      // Use JavaScript evaluation to stop playback
      const success = await this.page.evaluate(() => {
        try {
          // Try different methods to stop Strudel

          // Method 1: Global hush function
          if (window.hush && typeof window.hush === 'function') {
            window.hush();
            return true;
          }

          // Method 2: REPL stop method
          if (window.repl && window.repl.stop) {
            window.repl.stop();
            return true;
          }

          // Method 3: Look for stop button and click it
          const stopButton = document.querySelector('[data-cy="stop"], .stop-button, button[title*="stop"]');
          if (stopButton) {
            stopButton.click();
            return true;
          }

          console.log('No stop method found, Strudel might not be playing');
          return true; // Not necessarily an error

        } catch (err) {
          console.error('Error stopping Strudel:', err);
          return false;
        }
      });

      if (success) {
        console.log('✅ Strudel playback stopped');
        return true;
      } else {
        console.error('❌ Failed to stop Strudel playback');
        return false;
      }

    } catch (error) {
      console.error('❌ Failed to stop Strudel:', error);
      return false;
    }
  }

  isConnected(): boolean {
    return this.isInitialized && !!this.browser && !!this.page;
  }

  getStatus() {
    return {
      initialized: this.isInitialized,
      browserConnected: !!this.browser,
      pageReady: !!this.page,
      strudelUrl: this.strudelUrl
    };
  }

  async cleanup(): Promise<void> {
    console.log('🧹 Cleaning up Playwright resources...');

    try {
      if (this.page) {
        await this.page.close();
        this.page = undefined;
      }

      if (this.context) {
        await this.context.close();
        this.context = undefined;
      }

      if (this.browser) {
        await this.browser.close();
        this.browser = undefined;
      }

      this.isInitialized = false;
      console.log('✅ Playwright cleanup completed');

    } catch (error) {
      console.error('❌ Error during Playwright cleanup:', error);
    }
  }
}
