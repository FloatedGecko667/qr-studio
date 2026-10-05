import { expect, test, type Page } from '@playwright/test';
import { openApp, openTab } from './helpers.ts';

interface CameraLog {
  opened: unknown[];
  applied: unknown[];
}

/**
 * Fake cameras: canvas streams whose tracks report torch and zoom (as Android Chrome does) unless
 * `plain` is set, plus two video inputs for enumerateDevices.
 */
async function fakeCameras(page: Page, plain = false) {
  await page.evaluate((plain) => {
    const log: CameraLog = { opened: [], applied: [] };
    (window as unknown as { cameraLog: CameraLog }).cameraLog = log;
    navigator.mediaDevices.enumerateDevices = async () =>
      [
        { kind: 'videoinput', deviceId: 'front', label: 'Front camera', groupId: '' },
        { kind: 'videoinput', deviceId: 'back', label: 'Back camera', groupId: '' },
      ] as MediaDeviceInfo[];
    navigator.mediaDevices.getUserMedia = async (constraints) => {
      log.opened.push(constraints?.video);
      const video = constraints?.video as { deviceId?: { exact: string } };
      const id = video?.deviceId?.exact ?? 'back';
      const canvas = document.createElement('canvas');
      canvas.width = 320;
      canvas.height = 240;
      const ctx = canvas.getContext('2d')!;
      setInterval(() => ctx.fillRect(0, 0, 1, 1), 100);
      const stream = canvas.captureStream(10);
      const track = stream.getVideoTracks()[0];
      const settings: Record<string, unknown> = { deviceId: id, zoom: 1, torch: false };
      if (!plain) {
        track.getCapabilities = () => ({ torch: true, zoom: { min: 1, max: 5, step: 0.5 } }) as MediaTrackCapabilities;
      }
      track.getSettings = () => settings as MediaTrackSettings;
      track.applyConstraints = async (c) => {
        log.applied.push(c);
        Object.assign(settings, c?.advanced?.[0]);
      };
      return stream;
    };
  }, plain);
}

const cameraLog = (page: Page) => page.evaluate(() => (window as unknown as { cameraLog: CameraLog }).cameraLog);

test('camera: light, zoom and camera choice when the device offers them', async ({ page }) => {
  await openApp(page);
  await openTab(page, '読取');
  await fakeCameras(page);
  await page.getByRole('button', { name: 'カメラで読み取る' }).click();

  await page.getByRole('button', { name: 'ライトをつける' }).click();
  await expect(page.getByRole('button', { name: 'ライトを消す' })).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('slider', { name: 'ズーム' }).fill('3');
  await expect(page.getByText('3.0×')).toBeVisible();
  expect((await cameraLog(page)).applied).toEqual([{ advanced: [{ torch: true }] }, { advanced: [{ zoom: 3 }] }]);

  // Switching reopens that camera, and the choice is remembered for next time.
  await page.getByRole('combobox', { name: 'カメラ', exact: true }).selectOption({ label: 'Front camera' });
  await expect.poll(async () => (await cameraLog(page)).opened.at(-1)).toEqual({ deviceId: { exact: 'front' } });
  await page.getByRole('button', { name: 'カメラを止める' }).click();
  await page.reload();
  await openTab(page, '読取');
  await fakeCameras(page);
  await page.getByRole('button', { name: 'カメラで読み取る' }).click();
  await expect.poll(async () => (await cameraLog(page)).opened[0]).toEqual({ deviceId: { exact: 'front' } });
  await expect(page.getByRole('combobox', { name: 'カメラ', exact: true })).toHaveValue('front');
});

test('camera: no light or zoom controls when the track has none', async ({ page }) => {
  await openApp(page);
  await openTab(page, '読取');
  await fakeCameras(page, true);
  await page.getByRole('button', { name: 'カメラで読み取る' }).click();
  await expect(page.getByRole('combobox', { name: 'カメラ', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'ライトをつける' })).toHaveCount(0);
  await expect(page.getByRole('slider', { name: 'ズーム' })).toHaveCount(0);
});
