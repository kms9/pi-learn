/** Optional adapter instrumentation supplied only by the separate integration entry. */
export interface IntegrationHooks {
  point(name: string): Promise<void>;
  now?(): number;
}
