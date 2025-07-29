/**
 * @fileoverview Playwright manager for Strudel.
 * @author Zedro
 * @module
 *
 * @requires playwright
 */

import type { Browser, Page, BrowserContext } from 'playwright';
import { chromium } from 'playwright';

/**
* @class Playwright Manager
* @description Manages Playwright browser and page for Strudel repl.
*/
export class PlaywrightManager {
  private browser?: Browser;
  private context?: BrowserContext;
  private page?: Page;
  private strudelUrl: string;
  private isInitialized = false;

  /**
  * Constructs a new PlaywrightManager instance.
  * @constructor
  *
  * @param {string} strudelUrl - The URL containing the Strudel REPL.
  */
  constructor(strudelUrl: string) {
    this.strudelUrl = strudelUrl;
  }

  /**
  * Initializes the Playwright browser and navigates to the Strudel REPL.
  * @async
  *
  * @returns {Promise<boolean>} True if initialization is successful, false otherwise.
  */
  async initialize(): Promise<boolean> {
    try {
      console.log('🚀 Initializing Playwright browser…');
      this.browser = await chromium.launch({
        headless: false,
        args: ['--no-sandbox', '--disable-setuid-sandbox']
      });
      this.context = await this.browser.newContext({
        viewport: { width: 1280, height: 720 }
      });
      this.page = await this.context.newPage();
      this.page.setDefaultTimeout(30_000);

      console.log(`📱 Navigating to ${this.strudelUrl}/strudel`);
      await this.navigateWithRetry();                // ← robust navigation
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

  private async navigateWithRetry(max = 4) {
    for (let attempt = 1; attempt <= max; ++attempt) {
      try {
        await this.page!.goto(`${this.strudelUrl}/strudel`, {
          waitUntil: 'domcontentloaded',
          timeout: 30_000
        });
        return;                                      // 🎉 success
      } catch (err) {
        if (attempt === max) throw err;              // exhausted retries
        const backoff = 500 * attempt;               // linear back-off
        console.warn(`Navigation failed – retrying in ${backoff} ms …`);
        await new Promise(r => setTimeout(r, backoff));
      }
    }
  }

  /**
  * Waits for the Strudel REPL to be ready.
  * @private
  * @async
  *
  * @returns {Promise<void>} Resolves when the Strudel REPL is ready.
  */
  private async waitForStrudelReady(): Promise<void> {
    if (!this.page) throw new Error('Page not initialized');

    try {
      console.log('⏳ Waiting for Strudel REPL to be ready...');

      // Wait for page load
      await this.page.waitForLoadState('domcontentloaded');

      // Wait for element to be attached (not visible)
      await this.page.waitForSelector('strudel-editor', {
        state: 'attached',
        timeout: 30000
      });
      console.log('✅ strudel-editor element found');

      // Wait for the web component's .editor property to initialize
      await this.page.waitForFunction(() => {
        const strudelEditor = document.querySelector('strudel-editor') as any;
        return strudelEditor &&
          strudelEditor.editor &&
          typeof strudelEditor.editor.setCode === 'function';
      }, { timeout: 30000 });

      console.log('✅ Strudel editor API is ready');

    } catch (error) {
      console.error('❌ Strudel REPL failed to load:', error);
      throw error;
    }
  }

  /**
  * Sends code to the Strudel REPL.
  * @async
  *
  * @param {string} code - The code to send to the Strudel REPL.
  * @returns {Promise<boolean>} True if the code is successfully sent, false otherwise.
  */
  async sendCodeToStrudel(code: string): Promise<boolean> {
    if (!this.isInitialized || !this.page) {
      console.error('❌ Playwright not initialized');
      return false;
    }

    try {
      console.log('📤 Sending code to Strudel REPL...');
      console.log(`Code: ${code}`);

      const success = await this.page.evaluate((codeToSet) => {
        try {
          // Get the strudel-editor web component
          const strudelEditor = document.querySelector('strudel-editor') as any;

          if (!strudelEditor) {
            console.error('❌ strudel-editor element not found');
            return false;
          }

          if (!strudelEditor.editor) {
            console.error('❌ strudelEditor.editor property not available');
            return false;
          }

          if (typeof strudelEditor.editor.setCode !== 'function') {
            console.error('❌ setCode method not available');
            return false;
          }

          // Set the code using the official Strudel API
          strudelEditor.editor.setCode(codeToSet);
          console.log('✅ Code set successfully');

          // Optionally evaluate the code immediately
          if (typeof strudelEditor.editor.evaluate === 'function') {
            strudelEditor.editor.evaluate();
            console.log('✅ Code evaluated');
          }

          return true;

        } catch (err) {
          console.error('❌ Error in evaluate:', err);
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

  /**
  * Stops the Strudel REPL.
  * @async
  *
  * @returns {Promise<boolean>} True if the Strudel REPL is successfully stopped, false otherwise.
  */
  async stopStrudel(): Promise<boolean> {
    if (!this.isInitialized || !this.page) {
      console.error('❌ Playwright not initialized');
      return false;
    }

    try {
      console.log('⏹️ Stopping Strudel playback...');

      const success = await this.page.evaluate(() => {
        try {
          // Use strudel-editor web component API
          const strudelEditor = document.querySelector('strudel-editor') as any;
          if (strudelEditor && strudelEditor.editor && typeof strudelEditor.editor.stop === 'function') {
            strudelEditor.editor.stop();
            console.log('✅ Successfully stopped via strudel-editor API');
            return true;
          }

          // Fallback methods
          if ((window as any).hush && typeof (window as any).hush === 'function') {
            (window as any).hush();
            console.log('✅ Successfully stopped via global hush');
            return true;
          }

          console.log('⚠️ No stop method found');
          return true;

        } catch (err) {
          console.error('❌ Error stopping Strudel:', err);
          return false;
        }
      });

      return success;
    } catch (error) {
      console.error('❌ Failed to stop Strudel:', error);
      return false;
    }
  }

  async debugStrudel(): Promise<void> {
    if (!this.page) return;

    console.log('🔍 Strudel Diagnostics:');

    const info = await this.page.evaluate(() => {
      const editor = document.querySelector('strudel-editor') as any;
      return {
        hasElement: !!editor,
        hasEditor: !!(editor && editor.editor),
        hasSetCode: !!(editor && editor.editor && editor.editor.setCode),
        setCodeType: editor && editor.editor ? typeof editor.editor.setCode : 'undefined',
        availableMethods: editor && editor.editor ? Object.getOwnPropertyNames(editor.editor).filter(name => typeof editor.editor[name] === 'function') : []
      };
    });

    console.log('📊 Debug Results:', JSON.stringify(info, null, 2));

    if (!info.hasElement) {
      console.log('⚠️ No strudel-editor element found - check HTML template');
    }
    if (!info.hasSetCode) {
      console.log('⚠️ setCode method not available - web component may not be loaded');
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
