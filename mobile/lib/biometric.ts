import * as LocalAuthentication from 'expo-local-authentication';
import * as SecureStore from 'expo-secure-store';

const KEY = 'biometricLock';

/** Device has biometric hardware AND the user has enrolled a face/fingerprint. */
export async function isBiometricAvailable(): Promise<boolean> {
  try {
    const [hasHardware, enrolled] = await Promise.all([
      LocalAuthentication.hasHardwareAsync(),
      LocalAuthentication.isEnrolledAsync(),
    ]);
    return hasHardware && enrolled;
  } catch {
    return false;
  }
}

export async function getBiometricEnabled(): Promise<boolean> {
  return (await SecureStore.getItemAsync(KEY)) === '1';
}

export async function setBiometricEnabled(on: boolean): Promise<void> {
  await SecureStore.setItemAsync(KEY, on ? '1' : '0');
}

/** Prompt the OS biometric/passcode sheet. Returns true if authenticated. */
export async function authenticate(): Promise<boolean> {
  try {
    const res = await LocalAuthentication.authenticateAsync({
      promptMessage: 'Unlock BuildOne',
      fallbackLabel: 'Use device passcode',
    });
    return res.success;
  } catch {
    return false;
  }
}
