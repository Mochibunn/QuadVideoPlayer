import { requireOptionalNativeModule } from 'expo';
import { useEffect } from 'react';
import { Alert, Platform, Share } from 'react-native';

export async function showCrashReport(onlyNew = false) {
  if (Platform.OS !== 'android') return;
  try {
    const native = requireOptionalNativeModule<{ getCrashReport(): Promise<{ text: string; isNew: boolean } | null> }>('DownloadsMedia');
    const report = await native?.getCrashReport();
    if (!report) {
      if (!onlyNew) Alert.alert('No crash report available', 'Android has not recorded an available crash report for this app.');
      return;
    }
    if (onlyNew && !report.isNew) return;
    Alert.alert('Previous app crash',
      `${report.text.slice(0, 1500)}\n\nYou can share the full report to help diagnose the crash. It may include local media filenames. Nothing is sent automatically.`,
      [
        { text: 'Continue', style: 'cancel' },
        { text: 'Share report', onPress: () => {
          void Share.share({ message: report.text, title: 'Quad Video Player crash report' })
            .catch(() => Alert.alert('Could not share report', 'Open Last crash report in Settings and try again.'));
        } },
      ]);
  } catch (error) {
    if (!onlyNew) Alert.alert('Could not read crash report', error instanceof Error ? error.message : 'Please try again.');
  }
}
export default function CrashReportNotice() {
  useEffect(() => { void showCrashReport(true); }, []);
  return null;
}
