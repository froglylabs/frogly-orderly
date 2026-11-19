/**
 * Stand-in for @orderly.network/hooks in tests. The host app provides the real
 * package at run time; it is not installed in this repository. Tests that need
 * a broker ID replace this with vi.mock.
 */
export function useConfig(_key: "brokerId"): unknown {
  return undefined;
}
