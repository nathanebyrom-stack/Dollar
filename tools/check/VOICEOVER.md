# VoiceOver walk-through (the manual part of the Accessibility item)

Twenty minutes, on the preview: https://34automation-preview.netlify.app. Do the iPhone first; it is where the site will mostly be read. Write the fails (page, where, what you heard) at the bottom and hand this file back.

## Set-up

- **iPhone:** Settings > Accessibility > VoiceOver, on. Or triple-click the side button if that shortcut is set. Gestures: swipe right = next item, swipe left = previous, double-tap = activate, two-finger swipe up = read the page from the top, two-finger tap = stop reading. Rotor: twist two fingers on the screen, choose Headings, then swipe down to step through them.
- **Mac:** Cmd+F5 turns VoiceOver on. VO means Ctrl+Option. VO+Right Arrow = next item, VO+Space = activate, VO+U opens the rotor (Headings, Links, Form controls), VO+Cmd+H = next heading.
- Safari in both cases.

## 1. Home, read from the top

Two-finger swipe up (iPhone) or VO+A (Mac) and listen to the whole page once without touching anything.

| Expect to hear, in this order | Fail if |
|---|---|
| "Skip to content, link" first | anything else comes first |
| "34 Automation home, link" then the Main navigation: Services, Work, About, "Start a conversation" | a link is read as just "link" with no name, or the gold logo is read as an image with a file name |
| "Menu, button, collapsed" (iPhone only; the Mac shows the full navigation) | no "collapsed" / "expanded" state is announced |
| Heading level 1: "We bring dying brands back to life." then the intro paragraph | the die is described (it is a decoration and should be silent), or "34 Automation" is read a second time as a stray caption |
| "Pause motion, button" and "Play sound, button" | they are missing, or read in reverse order after a visual change |
| Heading level 2 "Services", then three service names as headings with a link each | a service is skipped, or they come out of order (Web design, Marketing, Workflow automation) |
| Heading level 2 "What automation actually does" and its text | the graph's node labels are read as a jumble |
| Heading level 2 "Work" then each work card: its title as a link, its status badge as text, a Play or Pause button | a card has no link name, or a video is announced as a video with controls (they are decorative) |
| Heading level 2 "Start a conversation" and the link | the CTA reads as anything other than "Start a conversation" |
| Footer navigation, then the privacy link | nothing after Work |

## 2. Headings only

Rotor > Headings, step through. You should get exactly one level 1 then level 2s in the order above (with level 3s under Services and Work). **Fail if** a level is skipped (1 to 3), or a heading is empty, or there are two level 1s.

## 3. The menu, iPhone

Find "Menu, button", double-tap. **Expect:** "expanded", then the next swipes go through all nine links including the three Services sub-links. Double-tap Menu again. **Expect:** "collapsed", and the links are gone from the swipe order. **Fail if** the links are still read while the menu is shut, or focus is lost after closing (VoiceOver jumps to the top).

## 4. Services sub-menu, Mac

VO+Right to "Services" in the header. **Expect:** the three sub-links follow it in the reading order. Press Escape. **Expect:** the sub-menu closes and VoiceOver's cursor stays in the navigation, not on a hidden link.

## 5. Motion and sound

Double-tap "Pause motion". **Expect:** the button now reads "Play motion". Double-tap "Play sound". **Expect:** "Mute sound", and a quiet workshop hum. **Fail if** either label does not change, or focus leaves the button.

## 6. Work page and one case study

/work/: each card is a link with the project name; Play / Pause buttons say which card they belong to. Open Fluid Process UK. **Expect:** one level 1 heading, the status (text, not just a colour), and the clips are not announced as videos needing attention. **Fail if** a card reads as "link, link".

## 7. Contact form

/contact/: swipe through. **Expect:** "Name, text field", "Email, email text field", "Message, text field" with their labels, and "Send, button". The honeypot ("Leave this empty if you are a person") should **not** be heard; if it is, that is a fail. Do not send.

## 8. Two more things on the iPhone

- Rotate to landscape on Home and read the top again: nothing should be lost.
- Settings > Accessibility > Motion > Reduce Motion on, reload Home: "Pause motion" should be gone (nothing moves), "Play sound" still there.

## Result

Date, device, iOS / macOS version, Safari version:

Fails (page, item, what you heard):

Anything that sounded odd but you are not sure about:
