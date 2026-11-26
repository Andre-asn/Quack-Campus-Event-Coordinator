// Closing the sheet keeps a reminder whose save already scheduled a notification.
// Leave and cancel unmount that control while the sheet stays open, so the same
// in-flight save must not leave the notification behind.
export function shouldDropReminderAfterUnmount(sheetStillOpen: boolean): boolean {
  return sheetStillOpen;
}
