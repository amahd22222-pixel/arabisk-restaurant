export async function readRequiredSnapshot(readJsonWithStatus, key, errorMessage) {
  const result = await readJsonWithStatus(key);
  if (!result.ok) throw new Error(errorMessage);
  return result.value;
}
