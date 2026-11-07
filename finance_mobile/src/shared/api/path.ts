export type PathParameters = Record<string, string | number>;

/** Remplace chaque `{param}` du gabarit par sa valeur encodée ; lève si une valeur manque. */
export function buildPath(
  template: string,
  parameters: PathParameters,
): string {
  return template.replace(/\{([^}]+)\}/g, (_placeholder, name: string) => {
    const value = parameters[name];
    if (value === undefined || value === null || value === "") {
      throw new Error(`Missing path parameter '${name}' for ${template}`);
    }
    return encodeURIComponent(String(value));
  });
}
