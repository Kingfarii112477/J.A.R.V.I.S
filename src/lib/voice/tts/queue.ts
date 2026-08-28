import type { LanguageCode } from "../language/types";

export interface SpeechQueueItem {
  text: string;
  msgId?: string;
  languageHint?: LanguageCode;
}

export interface SpeechQueueCallbacks {
  onStart?: (item: SpeechQueueItem) => void;
  onEnd?: (item: SpeechQueueItem) => void;
  onError?: (item: SpeechQueueItem, message: string) => void;
  /** Fires once, after an item finishes/fails, when the queue has nothing
   * left playing or pending — the single place a caller should hang
   * "the whole turn is done" logic (e.g. returning to IDLE), since which
   * enqueued sentence turns out to be the last one isn't known in advance
   * while a response is still streaming in. */
  onDrained?: () => void;
}

/** How the queue actually produces audio for one item — injected rather
 * than hard-coded, so this class stays free of React/settings/provider-
 * fallback concerns (all of which already live in useMessagePipeline's
 * speak()) and is trivially unit-testable with a fake. Must call exactly
 * one of onEnd/onError, exactly once, for every item it's given —
 * synchronously or async, doesn't matter, but never both and never zero. */
export type SpeakOneFn = (item: SpeechQueueItem, onEnd: () => void, onError: (message: string) => void) => void;

/**
 * Sequences text-to-speech across several items so a long streamed
 * response can start speaking its first sentence while later sentences
 * are still being generated, instead of waiting for the whole thing —
 * "Sentence 1 → TTS → play, while playing: Sentence 2 → generate/queue"
 * per the Phase 5 spec. A single mutable queue per conversation (one
 * instance lives in useMessagePipeline via useRef) rather than one queue
 * per message, so a brand-new user turn can always cleanly supersede
 * whatever the previous turn was still saying.
 */
export class SpeechQueue {
  private items: SpeechQueueItem[] = [];
  private speaking = false;
  private paused = false;
  private current: SpeechQueueItem | null = null;

  constructor(
    private speakOne: SpeakOneFn,
    private callbacks: SpeechQueueCallbacks = {}
  ) {}

  enqueue(item: SpeechQueueItem) {
    if (!item.text.trim()) {
      // A no-op enqueue (e.g. "nothing left to add after streaming")
      // must still report drained if the queue was already idle —
      // otherwise a caller relying on onDrained to know when it's safe
      // to move on (e.g. return to IDLE) would wait forever.
      this.checkDrained();
      return;
    }
    this.items.push(item);
    this.pump();
  }

  private pump() {
    if (this.speaking || this.paused || this.items.length === 0) return;
    const item = this.items.shift()!;
    this.speaking = true;
    this.current = item;
    this.callbacks.onStart?.(item);
    this.speakOne(
      item,
      () => {
        this.speaking = false;
        this.current = null;
        this.callbacks.onEnd?.(item);
        this.pump();
        this.checkDrained();
      },
      (message) => {
        this.speaking = false;
        this.current = null;
        this.callbacks.onError?.(item, message);
        this.pump();
        this.checkDrained();
      }
    );
  }

  private checkDrained() {
    if (!this.speaking && this.items.length === 0) this.callbacks.onDrained?.();
  }

  pause() {
    this.paused = true;
  }

  resume() {
    this.paused = false;
    this.pump();
  }

  /** Drops every not-yet-started item — the item currently playing (if
   * any) keeps playing until its own onEnd/onError fires. Use interrupt()
   * instead to also stop what's currently playing. */
  clear() {
    this.items = [];
  }

  /** Cancel this queue entirely: drop everything pending AND mark nothing
   * as currently speaking. Does not itself stop in-flight audio playback —
   * the caller (useMessagePipeline's stopSpeaking) is still responsible
   * for calling the active TTS provider's own cancel(), since only it
   * knows which provider/audio-element is actually live. This just makes
   * sure that once that happens, the queue doesn't resume playing
   * whatever was still pending. */
  interrupt() {
    this.items = [];
    this.speaking = false;
    this.current = null;
  }

  isSpeaking(): boolean {
    return this.speaking;
  }

  currentItem(): SpeechQueueItem | null {
    return this.current;
  }

  pendingCount(): number {
    return this.items.length;
  }
}
