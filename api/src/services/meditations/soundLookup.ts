export function buildSoundFilenameToNameLookup(
  soundFiles: Array<{ filename: string; name: string }>,
): (filename: string) => string | null {
  const filenameToName = new Map(
    soundFiles.map((sound) => [sound.filename, sound.name]),
  );

  return (filename: string) => filenameToName.get(filename) ?? null;
}
