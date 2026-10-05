import { readCsvFile } from './batch';

/**
 * A CSV file opened with the app (file handling, `launchQueue`), waiting for the batch screen of
 * the current mode to pick it up. `tooLarge` is shown there as an error.
 */
export const launchedCsv: { text: string | 'tooLarge' | null } = $state({ text: null });

interface LaunchParams {
  files: readonly { getFile(): Promise<File> }[];
}
interface LaunchQueue {
  setConsumer(consumer: (params: LaunchParams) => void): void;
}

/** Registers the file-handling consumer; `onCsv` runs after a CSV has been read. */
export function consumeLaunchedFiles(onCsv: () => void): void {
  const queue = (window as Window & { launchQueue?: LaunchQueue }).launchQueue;
  queue?.setConsumer(async (params) => {
    const handle = params.files[0];
    if (!handle) return;
    try {
      launchedCsv.text = await readCsvFile(await handle.getFile());
      onCsv();
    } catch {
      // The file vanished or permission was withdrawn: nothing to load.
    }
  });
}
