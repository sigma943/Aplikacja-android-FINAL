# Journeys device access

The tab is available automatically to role `owner`. All other roles, including
`admin`, require `permissions.journeys === true`. Missing permissions and legacy
`disableJourneys: false` do not grant access. A legacy explicit restriction still
wins over the positive grant. `canUseJourneys` is shared by the main navigation
and access tests. Startup fallback, planner mounting, desktop shortcut and
personalization choices respect the same effective access.

In Devices → Edit permissions, an owner can use **Włącz połączenia** for the
selected device. Normalization preserves a true opt-in when saving both the
device and its installation profile. Revoke the grant to hide the tab again.
Owners cannot lose their automatic access through this switch.

Firestore rules accept the new key, reject self-grants on new registration and
existing devices, and restrict grants/revocations to owners. Reinstalling from an
existing server-authorized installation profile retains its approved permission.
This controls application tab availability; public carrier timetable APIs remain
public.

Deployment: publishing/installing an APK does not deploy Firestore rules. The
rules in this PR must be deployed before granting access to other devices. The
existing `deploy-firebase.yml` workflow only runs from `main` and requires the
repository Firebase service-account secret; it has not been bypassed or changed.
No production rules deployment or automatic grant to existing devices is part of
the APK build. Default hiding and owner access work without a new grant record.
