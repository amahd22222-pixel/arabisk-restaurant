export async function readRequiredSnapshot(readJsonWithStatus, key, errorMessage) {
  const result = await readJsonWithStatus(key);
  if (!result.ok) throw new Error(errorMessage);
  return result.value;
}

export async function writeRequiredSnapshot(writeJson, key, value, errorMessage) {
  const written = await writeJson(key, value);
  if (!written) throw new Error(errorMessage);
  return true;
}
