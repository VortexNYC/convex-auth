export function skipUnlessConvexReady<TArgs>(args: TArgs, ready: boolean): TArgs | "skip" {
  return ready ? args : "skip";
}
