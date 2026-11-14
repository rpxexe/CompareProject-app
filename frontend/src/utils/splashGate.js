import { useEffect, useState } from "react";

// Lets screens hold their entrance animations until the launch splash starts to leave. Home is
// mounted underneath the splash while the app loads, so without this its intro would play out
// unseen behind it. Once the splash has gone, everything mounted later animates straight away.
let done = false;
const listeners = new Set();
let doneAt = 0;

// When the splash went (ms since epoch), so content mounted later can line up with an intro that
// is already playing instead of starting its own delay from zero. 0 while the splash is still up.
export const splashDoneAt = () => doneAt;

export function markSplashDone() {
  if (done) return;
  done = true;
  doneAt = Date.now();
  listeners.forEach((l) => l());
  listeners.clear();
}

export function useSplashDone() {
  const [isDone, setDone] = useState(done);
  useEffect(() => {
    if (done) {
      setDone(true);
      return undefined;
    }
    const l = () => setDone(true);
    listeners.add(l);
    return () => listeners.delete(l);
  }, []);
  return isDone;
}
