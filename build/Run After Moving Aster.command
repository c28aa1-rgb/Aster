#!/bin/bash

set -u

show_message() {
  /usr/bin/osascript -e "display dialog \"$1\" buttons {\"OK\"} default button \"OK\" with icon caution" >/dev/null 2>&1 || true
}

app_path="$HOME/Desktop/Aster.app"
if [[ ! -d "$app_path" ]]; then
  show_message "Aster wasn't found on your Desktop. Drag Aster.app from this disk image to your Desktop, then run this helper again."
  exit 1
fi

bundle_id=$(/usr/libexec/PlistBuddy -c 'Print :CFBundleIdentifier' "$app_path/Contents/Info.plist" 2>/dev/null || true)
if [[ "$bundle_id" != "com.aster.browser" ]]; then
  show_message "The app on your Desktop isn't Aster (bundle ID com.aster.browser). No changes were made."
  exit 1
fi

confirmation=$(
  /usr/bin/osascript 2>/dev/null <<'APPLESCRIPT'
button returned of (display dialog "This removes the downloaded-app quarantine flag from Aster on your Desktop. This weakens Gatekeeper's protection for that app. Continue only if you trust this copy of Aster." buttons {"Cancel", "Remove quarantine and open"} default button "Cancel" with icon caution)
APPLESCRIPT
) || exit 0

if [[ "$confirmation" != "Remove quarantine and open" ]]; then
  exit 0
fi

# Make repeat runs safe and confirm no quarantine marker remains in this app bundle.
/usr/bin/xattr -dr com.apple.quarantine "$app_path" >/dev/null 2>&1 || true
if /usr/bin/xattr -r -p com.apple.quarantine "$app_path" >/dev/null 2>&1; then
  show_message "macOS couldn't remove quarantine from Aster on your Desktop. Check that you have permission to modify it, then try again."
  exit 1
fi

if ! /usr/bin/open "$app_path"; then
  show_message "Quarantine was removed, but macOS couldn't open Aster. Open Aster.app from your Desktop."
  exit 1
fi
