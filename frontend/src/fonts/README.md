# Vendored fonts

Self-hosted so `next build` never fetches from fonts.googleapis.com or
fonts.gstatic.com. Loaded in `src/app/layout.tsx` through `next/font/local`.

| Family | Weights used | Files |
| --- | --- | --- |
| Space Grotesk | 500, 600, 700 | `space-grotesk-latin-wght-normal.woff2`, `space-grotesk-latin-ext-wght-normal.woff2` |
| Inter | 400, 500, 600 | `inter-latin-wght-normal.woff2`, `inter-latin-ext-wght-normal.woff2` |
| JetBrains Mono | 400, 500 | `jetbrains-mono-latin-wght-normal.woff2`, `jetbrains-mono-latin-ext-wght-normal.woff2` |

All are variable fonts (wght axis, normal style), declared in `layout.tsx` as a
weight range (for example `500 700`), which covers the weights the UI uses.
Source: the `@fontsource-variable/space-grotesk`, `@fontsource-variable/inter`
and `@fontsource-variable/jetbrains-mono` npm packages, version 5.3.0 each,
files under `files/<family>-<subset>-wght-normal.woff2` (fontsource repackages
the upstream OFL fonts: the same font versions and glyph coverage as Google
Fonts, though not byte-identical files).

## Subsets

latin and latin-ext. The UI shows user-entered project and task names, which
can contain Latin Extended glyphs (for example Polish, Czech or Turkish
letters), so latin alone is not enough. Each family declares its two faces
under one family name with the `unicode-range` fontsource publishes for that
subset, so the browser downloads the latin-ext file only when such a glyph is
rendered. The Google CSS used to serve more subsets (Cyrillic, Greek and
Vietnamese for Inter and JetBrains Mono, Vietnamese for Space Grotesk): those
glyphs now render in the fallback font. Add the matching
`<family>-<subset>-wght-normal.woff2` and a face with its `unicode-range`
(copy it from the package's `wght.css`) if they are needed.

## Licenses

All three fonts are licensed under the SIL Open Font License 1.1. The license
texts (with each project's copyright line) are in `OFL-Space-Grotesk.txt`,
`OFL-Inter.txt` and `OFL-JetBrains-Mono.txt`, copied verbatim from the
fontsource packages.

## Updating

Fetch the new `files/*-latin-wght-normal.woff2` and
`files/*-latin-ext-wght-normal.woff2` from the same packages
(`npm pack @fontsource-variable/<family>`), replace the files here, check that
the `unicode-range` values in `layout.tsx` still match the package's
`wght.css`, and update the version above.
