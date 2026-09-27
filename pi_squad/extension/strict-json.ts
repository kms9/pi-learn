import { parseDocument } from "yaml";
/** JSON syntax is checked first; the second pass rejects duplicate mapping keys. */
export function strictJSON(
  text: string,
  allowedKeys?: readonly string[],
): unknown {
  if (Buffer.byteLength(text) > 64 * 1024) throw new Error("CONFIG_TOO_LARGE");
  const value: unknown = JSON.parse(text);
  const document = parseDocument(text, {
    schema: "json",
    uniqueKeys: true,
    stringKeys: true,
  });
  if (document.errors.length || document.warnings.length)
    throw new Error(
      `INVALID_JSON: ${[...document.errors, ...document.warnings].map((e) => e.message).join("; ")}`,
    );
  if (allowedKeys) {
    if (!value || typeof value !== "object" || Array.isArray(value))
      throw new Error("JSON_OBJECT_REQUIRED");
    for (const key of Object.keys(value)) {
      if (!allowedKeys.includes(key)) throw new Error(`UNKNOWN_FIELD: ${key}`);
    }
  }
  return value;
}
