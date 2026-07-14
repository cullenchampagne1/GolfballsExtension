# Install the Golfballs Sales Toolkit (Windows, no admin)

These files enroll Chrome to install the extension for **your user account
only** and keep it auto-updated from the update server. No administrator
rights are required.

## Install

1. Download **`golfballs-extension-enroll.reg`**.
2. Double-click it and choose **Yes** when Windows asks to add it to the
   registry.
3. **Fully quit Chrome** (close every window) and reopen it.
4. The extension installs itself and updates automatically from then on.

Verify it worked: open `chrome://policy`, click **Reload policies**, and
confirm `ExtensionInstallForcelist` lists the extension. You can also see it
at `chrome://extensions` (it will show as installed by policy).

## Remove

1. Download and double-click **`golfballs-extension-remove.reg`**, choose **Yes**.
2. Restart Chrome. You can now remove the extension from `chrome://extensions`.

## Notes

- These write to `HKEY_CURRENT_USER` (your account), which is why no admin is
  needed. On a company-managed computer where an administrator has already
  locked Chrome's policies, the machine policy wins and these files have no
  effect — in that case ask IT to add the extension.
- Extension ID: `annoeoeiijgdgmlpefllibcilcamnjek`
- Update URL: `https://api.cullenchampagne.com/extension/updates.xml`
