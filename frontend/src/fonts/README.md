# Vendored fonts

Self-hosted so `next build` never fetches from fonts.googleapis.com or
fonts.gstatic.com. Loaded in `src/app/layout.tsx` through `next/font/local`.

| Family | Weights used | Files |
| --- | --- | --- |
| Space Grotesk | 500, 600, 700 | `space-grotesk-<subset>-wght-normal.woff2` for latin, latin-ext, vietnamese |
| Inter | 400, 500, 600 | `inter-<subset>-wght-normal.woff2` for latin, latin-ext, cyrillic, cyrillic-ext, greek, greek-ext, vietnamese |
| JetBrains Mono | 400, 500 | `jetbrains-mono-<subset>-wght-normal.woff2` for latin, latin-ext, cyrillic, cyrillic-ext, greek, vietnamese |

All are variable fonts (wght axis, normal style), declared in `layout.tsx` as a
weight range (for example `500 700`), which covers the weights the UI uses.
Source: the `@fontsource-variable/space-grotesk`, `@fontsource-variable/inter`
and `@fontsource-variable/jetbrains-mono` npm packages, version 5.3.0 each,
files under `files/<family>-<subset>-wght-normal.woff2` (fontsource repackages
the upstream OFL fonts: the same font versions and glyph coverage as Google
Fonts, though not byte-identical files).

## Subsets

Every subset the fontsource package ships for the family, which is exactly the
set the Google Fonts CSS served: latin and latin-ext for all three families,
plus vietnamese (all three), cyrillic and cyrillic-ext (Inter, JetBrains
Mono), greek-ext (Inter) and greek (Inter, JetBrains Mono). `next/font/google`
downloaded every subset in Google's response and only used `subsets` to choose
the preloads, so the rendered font stack was never latin-only; vendoring all
of them keeps that coverage, and user-entered project and task names with such
glyphs render in the real font, not a fallback. Each family declares one face
per subset under one family name with the `unicode-range` fontsource publishes
for it, so the browser downloads a subset file only when a glyph in its range
is rendered. Only the latin face is preloaded.

## Licenses

All three fonts are licensed under the SIL Open Font License 1.1. The license
texts (with each project's copyright line) are in `OFL-Space-Grotesk.txt`,
`OFL-Inter.txt` and `OFL-JetBrains-Mono.txt`, copied verbatim from the
fontsource packages.

## Updating

Fetch the new `files/*-wght-normal.woff2` for every subset from the same packages
(`npm pack @fontsource-variable/<family>`), replace the files here, check that
the `unicode-range` values in `layout.tsx` still match the package's
`wght.css`, and update the version above.
