import { useCallback, useEffect, useRef, useState } from "react";
import { DIGIT_WAIT_MS, typeDigit } from "../components/sudokuRules";

/**
 * Number keys typed one at a time, for numbers up to `max` (16-30 on a big sudoku).
 * Feed it each digit key; it calls `onNumber` once the number is settled, either
 * because no longer number can start with it or after DIGIT_WAIT_MS. `pending` is
 * the digits typed so far, to show the player. `reset` drops them (cell changed).
 */
export function useTypedNumber(max: number, onNumber: (n: number) => void) {
  const [pending, setPending] = useState("");
  const pendingRef = useRef("");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onNumberRef = useRef(onNumber);
  onNumberRef.current = onNumber;

  const set = (text: string) => {
    pendingRef.current = text;
    setPending(text);
  };

  const reset = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    set("");
  }, []);

  const key = useCallback(
    (digitKey: string) => {
      if (timer.current) clearTimeout(timer.current);
      timer.current = null;
      const { commit, pending: next } = typeDigit(pendingRef.current, digitKey, max);
      set(next);
      if (commit !== null) onNumberRef.current(commit);
      if (next !== "") {
        timer.current = setTimeout(() => {
          timer.current = null;
          const value = Number(pendingRef.current);
          set("");
          if (value >= 1) onNumberRef.current(value);
        }, DIGIT_WAIT_MS);
      }
    },
    [max]
  );

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  return { pending, key, reset };
}
