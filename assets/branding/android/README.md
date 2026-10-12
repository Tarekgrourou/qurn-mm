# وِرْد — Android launcher resources (staged)

Ready to copy into a native Android project's `app/src/main/res/` when one exists. Nothing in
the web build uses these files.

| File | Purpose |
| --- | --- |
| `mipmap-anydpi-v26/ic_launcher.xml`, `ic_launcher_round.xml` | Adaptive icon (API 26+): background, foreground and monochrome (themed icon, API 33+) layers |
| `drawable/ic_launcher_background.xml` | Full-bleed `#1C3F34` |
| `drawable/ic_launcher_foreground.xml` | The four cells of the design system's AppIcon: solid `#8FD1B3`, half, clay `#DEA488` at 34 %, empty `#2C634E`. Cell 24 %, gap 5 %, radius 28 % of the cell |
| `drawable/ic_launcher_monochrome.xml` | The same geometry in one colour, for Android 13+ themed icons |
| `values/strings.xml` | `app_name` = وِرْد, the label under the launcher icon |
| `values/colors.xml` | Splash background and widget colours |

These files, the SVGs in `../svg` and the PNGs in `../png` are generated from one description of
the icon, so they always agree.

## Safe zone

An adaptive icon layer is 108×108 dp; launchers show the central 72 dp. The icon box is that
72 dp square, so the grid spans 38 dp and its corners sit 27 dp from the centre, inside the
33 dp safe radius for every mask shape.

## Wiring

In `AndroidManifest.xml`, set `android:icon="@mipmap/ic_launcher"`,
`android:roundIcon="@mipmap/ic_launcher_round"` and `android:label="@string/app_name"`. For
pre-API-26 devices, also generate legacy PNG mipmaps, for example from
`../png/wird_icon_512.png`.

Splash (Android 12+ `SplashScreen` API): use `wird_splash_background` as the window background
and the foreground drawable as the icon. Do this with no animation.
