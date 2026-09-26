# Lunar Daybreak

Light is the organizing material. Cool white opens into silver-blue at the edge of a broad field. A single mineral sphere supplies the visual weight, balanced by enough empty space to feel deliberate. The composition should appear labored over with care: scale, light direction, and the distance between forms must agree.

Geometry follows the language of an observatory. Fine orbital bands intersect a solid body, with the hidden sections truly hidden. The subtle reference is the moment a telescope resolves a distant object into a physical world. Painstaking attention to occlusion and lighting gives a simple shape depth without adding a crowd of marks.

Teal anchors the image; lavender appears only in reflected light. Surfaces carry a restrained grain, while the surrounding sky stays clear. Tonal transitions are the product of deep expertise, calibrated to remain visible without competing with the page's working area.

Typography is sparse. Instrument Serif gives the central question an open, human rhythm; Instrument Sans handles controls and time. Text earns its place by identifying an action or reporting something real. Spacing and a consistent optical center carry hierarchy without extra labels.

Stillness is part of the finish. The planetary system has a stable center, and its bands never drift. Master-level execution here means refining the edge, balance, and silhouette before adding any detail. Interaction may briefly compress a control or lift a shortcut, but the art stays at rest.

## Theme tokens

| Token | Color | Role |
| --- | --- | --- |
| Cloud | #F3F7F8 | Page and negative space |
| Ice | #DDE8ED | Lower atmosphere |
| Deep teal | #23494E | Heading and primary control |
| Slate | #60767F | Secondary text |
| Moonstone | #AEB7D1 | Orbital highlights |
| White | #FFFFFF | Search surface |

This custom light theme carries forward the user's light-color request and the cosmic subject of the earlier Midnight Galaxy selection. The palette is shown here for review rather than restarting theme selection.

## Layout plan

Center the primary task above the lower-right planetary illustration. Keep the brand and date at opposite edges of the header, and keyboard hints in the footer.

```text
 Aster                                  Date / time

                    Where next?
              [       Search       ]
                 Four shortcuts

                                      Ringed planet
 Keyboard hints                           Small moon
```

## Review before implementation

Removed the old observatory eyebrow and extension-status sentence: neither helps a person start browsing. Replaced the busy all-over orbital diagram with one shaded object and a clear working area. No cards, invented statistics, rotating background, or decorative uppercase labels.

## Motion and copy

Calm, with an interaction curve of (0.2, 0, 0, 1). Press feedback uses a damped spring; hover feedback settles in 120–180 ms. Primary motion is the pressed control, secondary motion is its icon, and the focus shadow provides the surrounding response. All are user-triggered. Reduced-motion users receive the same states without translation or scaling.

The interface retains “Where next?” and “Search the web.” Shortcut names are the actual destinations. The copy pass removes promotional claims and implementation details.
