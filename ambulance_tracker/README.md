# Ambulance Driver App

A small Flutter app for the **ambulance driver's phone**. The phone is set up
once (usually by hospital staff, by scanning a QR code), then the driver just
opens the app, sees the one transfer their ambulance is assigned to (sending →
receiving hospital), and taps through the journey: **Start journey → Patient
picked up → Patient arrived**. While the journey is underway the phone streams
its GPS position to the eBuzima backend, which plots it live on the clinician
map.

## How it fits the backend

The app authenticates as the **ambulance** — there are no hardware keys/tokens to
flash. A facility admin registers the ambulance in the web console
(**Admin → Ambulances**) with a plate, driver details, and a **login ID**. The
**server generates the password** and shows it once as a **setup QR code**.

Setting up a phone is the admin's job, not the driver's, and takes one scan:

- **Scan setup code** — point the phone's camera at the QR the console shows.
  The QR carries the server address, login ID, and one-time password, so the app
  signs itself in. The driver never types or sees credentials.
- **Enter manually** — the same three values can be typed in if there's no QR to
  scan (e.g. the code was sent as text).

Either way the app calls:

```
POST {server}/api/v1/driver/login    { "login_id": ..., "password": ... }
   → { "token": <bearer>, "ambulance": {...} }
```

All other calls send `Authorization: Bearer <token>`:

| Call | Purpose |
| ---- | ------- |
| `GET  /driver/journey` | The journey assigned to this ambulance, or `null` |
| `POST /driver/journey/start`   | Driver set off to collect the patient |
| `POST /driver/journey/picked`  | Patient is on board |
| `POST /driver/journey/arrived` | Patient delivered to the receiving hospital |
| `POST /driver/journey/ping`    | One GPS fix `{ latitude, longitude }` |

The server knows which transfer the ambulance is on (its in-progress transport
event), advances the transfer's status, notifies the clinicians, and records
each position against that transfer.

## Setup

The Android/iOS platform projects are already scaffolded and the location,
internet, and camera permissions are already declared. To run:

```bash
flutter pub get
flutter run            # or: flutter build apk --release
```

Then **in the app**, tap **Scan setup code** and point the camera at the QR the
hospital console shows when the ambulance is registered (or when its password is
reset). The phone signs in on its own. If you can't scan, tap **enter manually**
and type the **Server address**, **Login ID**, and **password** instead. When a
clinician assigns the ambulance to a transfer it appears automatically; otherwise
the app waits.

> If you re-run `flutter create .` to regenerate the native projects, re-add the
> permissions: `INTERNET`, `ACCESS_FINE_LOCATION`, `ACCESS_COARSE_LOCATION`,
> `CAMERA` in `android/app/src/main/AndroidManifest.xml`, and
> `NSLocationWhenInUseUsageDescription` + `NSCameraUsageDescription` in
> `ios/Runner/Info.plist`.

## Notes / limitations

- The GPS stream runs automatically **only while a journey is underway** (after
  Start, until Arrived) and while the app is **foregrounded**. The screen is kept
  awake (`wakelock_plus`) — keep the phone on charge. For streaming with the
  screen locked, a foreground-service plugin would be the next step; it was left
  out to keep the app small.
- The app polls `/driver/journey` every ~12 s so a newly dispatched journey shows
  up without the driver doing anything.
- The login token is stored locally with `shared_preferences`, so setup is a
  **one-time** step — after the first scan the app opens straight to the journey
  screen. Signing out clears the token; an admin can disable the ambulance (or
  reset its password) from the web console if a phone is lost.

## Project layout

```
lib/
  main.dart                  app entry; routes to sign-in or journey
  config.dart                persisted server URL / token / plate / interval
  driver_api.dart            login + journey actions + GPS ping
  location.dart              permission + GPS read (geolocator)
  screens/
    login_screen.dart        scan setup code, or enter server/login/password
    scan_screen.dart         camera that reads the setup QR
    journey_screen.dart      route, step tracker, the big next-step button
```
