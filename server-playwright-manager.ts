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
  private audioContextInitialized = false;

  /**
  * @constructor
  * @description Constructs a new PlaywrightManager instance.
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
        args: [
          '--autoplay-policy=no-user-gesture-required',
          '--disable-web-security',
          '--disable-background-timer-throttling',
          '--disable-renderer-backgrounding',
          '--disable-backgrounding-occluded-windows',
          '--enable-features=AudioWorkletRealtimeThread',
          '--use-fake-ui-for-media-stream',
          '--use-fake-device-for-media-stream',
          '--disable-dev-shm-usage',
          '--no-sandbox',
          '--disable-setuid-sandbox'
        ],
        headless: false // AudioWorklet may work better in headed mode
      });
      // this.browser = await chromium.launch({
      // 	headless: false,
      // 	args: ['--no-sandbox', '--disable-setuid-sandbox']
      // });
      this.context = await this.browser.newContext({
        viewport: { width: 1280, height: 720 },
        permissions: ['camera', 'microphone']
      });
      this.page = await this.context.newPage();
      this.page.setDefaultTimeout(30_000);

      // Initialize AudioContext before navigation
      await this.setupAudioWorkletContext();

      console.log(`📱 Navigating to ${this.strudelUrl}/strudel`);
      await this.navigateWithRetry();                // ← robust navigation
      await this.waitForStrudelReady();

      // Initialize audio after Strudel is ready
      await this.initializeAudioContext();

      this.isInitialized = true;
      console.log('✅ Playwright browser ready and targeting Strudel REPL');
      return true;
    } catch (error) {
      console.error('❌ Failed to initialize Playwright:', error);
      await this.cleanup();
      return false;
    }
  }

  /**
   * Sets up AudioWorklet context initialization scripts
   * @private
   * @async
   */
  private async setupAudioWorkletContext(): Promise<void> {
    if (!this.page) throw new Error('Page not initialized');

    // Add initialization script that runs before page content loads
    await this.page.addInitScript(() => {
      // Global audio context setup
      let globalAudioContext: AudioContext | null = null;

      // Function to create and configure AudioContext
      const createAudioContext = async (): Promise<AudioContext> => {
        if (globalAudioContext && globalAudioContext.state !== 'closed') {
          return globalAudioContext;
        }

        const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();

        // Resume context if suspended
        if (audioContext.state === 'suspended') {
          await audioContext.resume();
        }

        return audioContext;
      };

      // Initialize on page load
      window.addEventListener('DOMContentLoaded', async () => {
        try {
          globalAudioContext = await createAudioContext();
          (window as any).audioContext = globalAudioContext;

          console.log('✅ AudioContext initialized:', {
            state: globalAudioContext.state,
            sampleRate: globalAudioContext.sampleRate,
            baseLatency: globalAudioContext.baseLatency
          });
        } catch (error) {
          console.error('❌ Failed to initialize AudioContext:', error);
        }
      });

      // Expose audio context creation function globally
      (window as any).ensureAudioContext = createAudioContext;

      // Override AudioContext constructor to use our global instance
      const OriginalAudioContext = window.AudioContext || (window as any).webkitAudioContext;

      const AudioContextProxy = function(...args: any[]) {
        if (globalAudioContext && globalAudioContext.state !== 'closed') {
          return globalAudioContext;
        }
        return new OriginalAudioContext(...args);
      };

      // Copy prototype and static methods
      AudioContextProxy.prototype = OriginalAudioContext.prototype;
      Object.setPrototypeOf(AudioContextProxy, OriginalAudioContext);

      // Replace global AudioContext
      window.AudioContext = AudioContextProxy;
      if ((window as any).webkitAudioContext) {
        (window as any).webkitAudioContext = AudioContextProxy;
      }
    });
  }

  /**
  * Initializes AudioContext and triggers user gesture for audio
  * @private
  * @async
  */
  private async initializeAudioContext(): Promise<void> {
    if (!this.page) throw new Error('Page not initialized');

    try {
      console.log('🎵 Initializing AudioContext for Strudel...');

      // Simulate user gesture and initialize audio
      await this.page.evaluate(async () => {
        // Create a synthetic user event to satisfy autoplay requirements
        const clickEvent = new MouseEvent('click', {
          bubbles: true,
          cancelable: true,
          view: window
        });
        document.body.dispatchEvent(clickEvent);

        // Ensure AudioContext is running
        if ((window as any).audioContext) {
          const ctx = (window as any).audioContext;
          if (ctx.state === 'suspended') {
            await ctx.resume();
          }
          console.log('🎵 AudioContext state:', ctx.state);
        }

        // Initialize audio context if not already done
        if (typeof (window as any).ensureAudioContext === 'function') {
          await (window as any).ensureAudioContext();
        }
      });

      // Verify AudioContext is working
      const audioStatus = await this.page.evaluate(() => {
        const ctx = (window as any).audioContext;
        return {
          exists: !!ctx,
          state: ctx?.state,
          sampleRate: ctx?.sampleRate,
          baseLatency: ctx?.baseLatency
        };
      });

      if (audioStatus.exists && audioStatus.state === 'running') {
        this.audioContextInitialized = true;
        console.log('✅ AudioContext successfully initialized:', audioStatus);
      } else {
        console.warn('⚠️ AudioContext may not be properly initialized:', audioStatus);
      }

    } catch (error) {
      console.error('❌ Failed to initialize AudioContext:', error);
    }
  }

  /**
   * Ensures AudioContext is ready before audio operations
   * @private
   * @async
   */
  private async ensureAudioReady(): Promise<boolean> {
    if (!this.page) return false;

    try {
      const isReady = await this.page.evaluate(async () => {
        const ctx = (window as any).audioContext;
        if (!ctx) return false;

        if (ctx.state === 'suspended') {
          await ctx.resume();
        }

        return ctx.state === 'running';
      });

      return isReady;
    } catch (error) {
      console.error('❌ Error checking audio readiness:', error);
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
    //
    // Ensure audio is ready for sample playback
    await this.ensureAudioReady();

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
   * @method startStrudel
   * @description Starts the Strudel REPL.
   * @async
   * 
   * @returns {Promise<boolean>} True if the Strudel REPL is successfully started, false otherwise.
   */
  async startStrudel(): Promise<boolean | undefined> {
    if (!this.isInitialized || !this.page) {
      console.error('❌ Playwright not initialized');
      return false;
    }

    // Ensure audio context is ready before starting
    const audioReady = await this.ensureAudioReady();
    if (!audioReady) {
      console.warn('⚠️ AudioContext not ready, audio may not work properly');
    }

    try {
      console.log(' Starting Strudel playback...');

      const success: boolean | undefined = await this.page.evaluate(() => {
        try {
          // Use strudel-editor web component API
          const strudelEditor = document.querySelector('strudel-editor') as any;
          if (strudelEditor && strudelEditor.editor && typeof strudelEditor.editor.start === 'function') {
            strudelEditor.editor.evaluate();
            console.log('✅ Successfully started via strudel-editor playback');
            return true;
          }
        } catch (err) {
          console.error('❌ Error in evaluate:', err);
          return false;
        }
      });

      return success;
    } catch (error) {
      console.error('❌ Failed to stop Strudel:', error);
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
      console.log(' Stopping Strudel playback...');

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

  /**
   * Debugs AudioWorklet and Strudel setup
   * @async
   */
  async debugStrudel(): Promise<void> {
    if (!this.page) return;

    console.log('🔍 Strudel & AudioWorklet Diagnostics:');

    const info = await this.page.evaluate(() => {
      const editor = document.querySelector('strudel-editor') as any;
      const ctx = (window as any).audioContext;

      return {
        // Strudel info
        hasElement: !!editor,
        hasEditor: !!(editor && editor.editor),
        hasSetCode: !!(editor && editor.editor && editor.editor.setCode),
        setCodeType: editor && editor.editor ? typeof editor.editor.setCode : 'undefined',
        availableMethods: editor && editor.editor ?
          Object.getOwnPropertyNames(editor.editor).filter(name => typeof editor.editor[name] === 'function') : [],

        // Audio info
        hasAudioContext: !!ctx,
        audioContextState: ctx?.state,
        sampleRate: ctx?.sampleRate,
        baseLatency: ctx?.baseLatency,
        audioWorkletSupport: !!(ctx && ctx.audioWorklet),

        // Browser audio features
        userAgent: navigator.userAgent,
        audioContextConstructor: !!(window.AudioContext || (window as any).webkitAudioContext)
      };
    });

    console.log('📊 Debug Results:', JSON.stringify(info, null, 2));

    if (!info.hasElement) {
      console.log('⚠️ No strudel-editor element found - check HTML template');
    }
    if (!info.hasSetCode) {
      console.log('⚠️ setCode method not available - web component may not be loaded');
    }
    if (!info.hasAudioContext) {
      console.log('⚠️ No AudioContext found - audio will not work');
    }
    if (info.audioContextState !== 'running') {
      console.log(`⚠️ AudioContext state is '${info.audioContextState}' - should be 'running'`);
    }
    if (!info.audioWorkletSupport) {
      console.log('⚠️ AudioWorklet not supported - advanced audio features may not work');
    }
  }

  /**
   * Gets audio context status
   * @returns {Promise<object>} Audio context information
   */
  async getAudioStatus(): Promise<any> {
    if (!this.page) return { error: 'Page not initialized' };

    return await this.page.evaluate(() => {
      const ctx = (window as any).audioContext;
      return {
        hasAudioContext: !!ctx,
        state: ctx?.state,
        sampleRate: ctx?.sampleRate,
        baseLatency: ctx?.baseLatency,
        outputLatency: ctx?.outputLatency,
        audioWorkletSupported: !!(ctx && ctx.audioWorklet),
        currentTime: ctx?.currentTime
      };
    });
  }

  isConnected(): boolean {
    return this.isInitialized && !!this.browser && !!this.page;
  }

  /**
  * Gets the current status of the PlaywrightManager.
  * @returns {object} An object containing the current status of the PlaywrightManager.
  */
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
      this.audioContextInitialized = false;
      console.log('✅ Playwright cleanup completed');

    } catch (error) {
      console.error('❌ Error during Playwright cleanup:', error);
    }
  }
}
