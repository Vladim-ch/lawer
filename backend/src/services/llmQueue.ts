/**
 * LLM concurrency limiter.
 *
 * Ollama is configured with OLLAMA_NUM_PARALLEL=1 and limited RAM (1536 MB).
 * Multiple concurrent LLM requests will either queue inside Ollama (adding
 * latency to everyone) or cause OOM. This semaphore serializes access so only
 * one ReAct agent loop runs at a time, while the rest wait in a FIFO queue.
 */

const MAX_CONCURRENT = parseInt(process.env.LLM_MAX_CONCURRENT || "1", 10);

interface Waiter {
  resolve: () => void;
  reject: (err: Error) => void;
}

let running = 0;
const queue: Waiter[] = [];

/**
 * Returns the current position in the queue (0 = will run immediately).
 */
export function queuePosition(): number {
  return queue.length;
}

/**
 * Acquire a slot. Resolves immediately if a slot is free,
 * otherwise waits in FIFO order. Rejects if the signal is aborted.
 */
export function acquire(signal?: AbortSignal): Promise<void> {
  if (running < MAX_CONCURRENT) {
    running++;
    return Promise.resolve();
  }

  return new Promise<void>((resolve, reject) => {
    const waiter: Waiter = { resolve, reject };
    queue.push(waiter);

    if (signal) {
      const onAbort = () => {
        const idx = queue.indexOf(waiter);
        if (idx !== -1) {
          queue.splice(idx, 1);
          reject(new DOMException("Aborted", "AbortError"));
        }
      };

      if (signal.aborted) {
        onAbort();
        return;
      }

      signal.addEventListener("abort", onAbort, { once: true });
    }
  });
}

/**
 * Release a slot, letting the next waiter (if any) proceed.
 */
export function release(): void {
  const next = queue.shift();
  if (next) {
    next.resolve();
  } else {
    running = Math.max(0, running - 1);
  }
}
