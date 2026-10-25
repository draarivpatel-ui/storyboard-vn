## The Glass Meridian
##
## A visual novel in six scenes and four endings, written for Hack Club Storyboard.
##
## This file is read by two programs. Desktop Ren'Py 8 runs it as a normal game.
## The browser runtime in this repository (engine.js) parses the same file at
## runtime, so the story you play on the web is the story in this script.
## Only a small, documented subset of Ren'Py is used so both stay in agreement.

## Characters #################################################################

define mira = Character("Mira", color="#1E5E63")
define soren = Character("Soren", color="#B4532A")
define voss = Character("Archivist Voss", color="#4A4036")

## Persistent state ############################################################
## trust_score        how much Mira, Voss and Soren rely on you
## calibration_drift  how far your shortcuts have pulled the lens off true
## lens_unlocked      whether the lens gallery key is in your hands

default trust_score = 0
default calibration_drift = 0
default lens_unlocked = False
default ledger_read = False
default asked_failure = False
default accord_signed = False
default tide_entries = 0

default persistent.ending_meridian_restored = False
default persistent.ending_silent_observatory = False
default persistent.ending_tidal_accord = False
default persistent.ending_glass_fracture = False

## Images ######################################################################
## Backgrounds are single SVG files. Characters are layered: one body file and
## one face file per expression, composited at the same size.

image bg harbor = "images/bg_harbor.svg"
image bg archive = "images/bg_archive.svg"
image bg workshop = "images/bg_workshop.svg"
image bg storm = "images/bg_storm.svg"
image bg lens = "images/bg_lens.svg"
image bg dawn = "images/bg_dawn.svg"

image mira calm = Composite((520, 900), (0, 0), "images/mira_body.svg", (0, 0), "images/mira_face_calm.svg")
image mira worried = Composite((520, 900), (0, 0), "images/mira_body.svg", (0, 0), "images/mira_face_worried.svg")
image mira smile = Composite((520, 900), (0, 0), "images/mira_body.svg", (0, 0), "images/mira_face_smile.svg")

image soren guarded = Composite((520, 900), (0, 0), "images/soren_body.svg", (0, 0), "images/soren_face_guarded.svg")
image soren smirk = Composite((520, 900), (0, 0), "images/soren_body.svg", (0, 0), "images/soren_face_smirk.svg")
image soren open = Composite((520, 900), (0, 0), "images/soren_body.svg", (0, 0), "images/soren_face_open.svg")

image voss stern = Composite((520, 900), (0, 0), "images/voss_body.svg", (0, 0), "images/voss_face_stern.svg")
image voss soft = Composite((520, 900), (0, 0), "images/voss_body.svg", (0, 0), "images/voss_face_soft.svg")
image voss grave = Composite((520, 900), (0, 0), "images/voss_body.svg", (0, 0), "images/voss_face_grave.svg")

## Entry point #################################################################

label start:
    jump scene1_arrival

## Scene 1, the harbor stair ###################################################

label scene1_arrival:
    scene bg harbor with fade
    "The ferry leaves you on a stone stair at the edge of Meridian Point, and the tide is already going out without you."
    "Above the harbor, at the top of the white tower, the great lens sits under its brass hood. The mainland calls it the Glass Meridian."
    "Once a century, on the Long Tide, it has to be set against the stars again. If it is not, every tide table in the harbor drifts until a ship finds a rock."
    "This is the year. The Long Tide comes in three nights."
    show mira calm at left with dissolve
    mira "You are the apprentice the coast board promised. Good. You are early, and the sea is late."
    mira "I am Mira. I keep the tower now. Ask me anything, but ask it while you carry something."
    menu:
        "Mira has a tide book open on the rail, its pages swollen with salt. What do you do?"

        "Offer to help her log the morning tide.":
            $ trust_score += 1
            jump scene1_tidelog

        "Say you came to see the lens, not to count water.":
            $ calibration_drift += 1
            jump scene1_gallery

        "Ask what happened to the last keeper.":
            $ trust_score += 1
            jump scene1_keeper

label scene1_tidelog:
    mira "Hold the book flat. The wind likes to read ahead."
    call tide_log
    show mira smile
    mira "Most people who arrive want the lens first. You wanted the boring part. I will remember that."
    jump scene2_archive

label scene1_gallery:
    show mira worried
    mira "The lens will be there tomorrow. The water will not, not the way it is today."
    mira "Fine. Look, but do not touch the brass. Last time someone touched the brass, we lost a century."
    "She says it lightly. She does not smile when she finishes."
    jump scene2_archive

label scene1_keeper:
    show mira worried
    mira "Keeper Aldous. He ran the last calibration a hundred years ago, on the Long Tide, and then the glass cracked."
    mira "Not all at once. That is the story the archive tells, anyway. Ask Voss, he keeps the story."
    mira "Thank you for asking me first. Most people ask the archive and never come back up the stair."
    jump scene2_archive

## Subroutine, reused in scenes 1 and 3 ########################################

label tide_log:
    $ tide_entries += 1
    "The tide book has two columns. One is what the almanac promised and one is what the water did."
    mira "Four fingers lower than the table says. Entry [tide_entries] this week, and it is always a little lower now."
    return

## Scene 2, the archive ########################################################

label scene2_archive:
    scene bg archive with fade
    show voss stern at right with dissolve
    "The archive is a round room under the tower, lined with drawers that each hold one year of the sea."
    voss "A new face. I am Archivist Voss. I have outlived four keepers and the paint on this door."
    voss "You will want the vault key. Everyone does, in the week of the Long Tide. Let me tell you what the key costs."
    jump scene2_archive_menu

label scene2_archive_menu:
    menu:
        "Voss waits beside a lectern, a ledger open under his hand."

        "Ask to read the calibration ledger." if not ledger_read:
            jump scene2_ledger

        "Ask why the last calibration failed." if not asked_failure:
            jump scene2_failure

        "Ask for the vault key." if trust_score >= 1 and not lens_unlocked:
            jump scene2_key

        "Thank him and head down to the workshop.":
            jump scene3_workshop

label scene2_ledger:
    $ ledger_read = True
    show voss soft
    voss "Keeper Aldous wrote down every degree. Read the margins, not the numbers. The margins say where he hurried."
    if calibration_drift > 0:
        voss "You have already shown me one shortcut today. The ledger will help you undo the habit before it sets."
        $ calibration_drift -= 1
    else:
        voss "You have taken no shortcuts so far. The ledger will only confirm that you should keep it that way."
    jump scene2_archive_menu

label scene2_failure:
    $ asked_failure = True
    $ trust_score += 1
    show voss grave
    voss "He aligned the lens in one night because the storm window was closing. The glass held until the first full moon."
    voss "Then it sang, a high note nobody could place, and then it split along the line he had rushed."
    voss "Thank you for asking it plainly. Most people ask me for a villain."
    jump scene2_archive_menu

label scene2_key:
    $ lens_unlocked = True
    $ trust_score += 1
    show voss stern
    voss "I do not give this key to people who ask for it first. You asked for it third. That will do."
    "The key is brass, cold, and heavier than it looks. Voss does not let go until you nod."
    voss "It opens the lens gallery. It does not make the lens forgive you."
    jump scene2_archive_menu

## Scene 3, the workshop #######################################################

label scene3_workshop:
    scene bg workshop with fade
    show soren guarded at right with dissolve
    "The workshop smells of lamp oil and warm copper. A prism the size of a loaf of bread is clamped in a cradle on the bench."
    soren "The cradle seat is cracked. If the prism sits wrong, the whole beam bends, and the beam is the only honest thing on this island."
    soren "I am Soren, from the instrument guild. I am here to fix the seat. I am not here to make friends."
    show mira calm at left with dissolve
    mira "He says that to everyone. He has also not left in two days."
    call tide_log
    menu:
        "The seat needs a second polish before the prism can rest on it. How do you help?"

        "Hold the prism steady while Soren cuts the seat.":
            $ trust_score += 1
            jump scene3_steady

        "Tell Soren to skip the second polish, because the tide will not wait.":
            $ calibration_drift += 1
            jump scene3_rush

        "Ask Soren what the guild really wants from the lens.":
            jump scene3_guild

label scene3_steady:
    show soren open
    soren "Steady hands. I did not expect that from someone who walked in smiling."
    "The seat comes true under the file, one slow pass at a time. Soren stops talking, which you take as a compliment."
    jump scene4_storm

label scene3_rush:
    show soren smirk
    soren "Fast and a little wrong. The guild will love you."
    show mira worried
    mira "A little wrong is how a century gets lost. Remember that when the glass is in front of you."
    jump scene4_storm

label scene3_guild:
    show soren guarded
    soren "A signed copy of the new tide tables. The guild sells them to every harbor on the coast, and a working lens means they are right."
    show soren open
    soren "That is not a villain's reason. That is an invoice. But I will not pretend I like it."
    jump scene4_storm

## Scene 4, the storm night ####################################################

label scene4_storm:
    scene bg storm with fade
    show mira worried at left with dissolve
    "The storm comes in a day early. By dusk the harbor lamp is bending in its housing and the fog bell rings itself."
    mira "The lamp needs a second pair of hands. And the vault door on the gallery stair is jammed, and I cannot tell if that is the storm or somebody."
    menu:
        "Rain is coming sideways through the stair window. What do you do?"

        "Lend Mira your hands at the harbor lamp.":
            jump scene4_lamp

        "Force the vault with Soren's tools." if not lens_unlocked:
            jump scene4_force

        "Keep the vault sealed until the storm passes." if not lens_unlocked:
            jump scene4_sealed

        "Read the ledger by lantern while the storm passes." if lens_unlocked:
            jump scene4_reading

label scene4_lamp:
    $ trust_score += 1
    show mira smile
    mira "Left. A little more left. There."
    "The two of you wedge the lamp straight with a folded tide book and a boot. The beam steadies across the water."
    mira "I thought I would do that alone. I am glad I did not."
    jump scene5_calibration

label scene4_force:
    $ lens_unlocked = True
    $ calibration_drift += 2
    show soren smirk at right with dissolve
    soren "Pry here, lean there, and apologize to the door afterward."
    "The vault gives with a crack like a knuckle. The key inside is warm from the damp, and so are your hands."
    show mira worried
    mira "You did not ask Voss. I will not say anything. But the lens will know."
    jump scene5_calibration

label scene4_sealed:
    show mira calm
    mira "Sealed it is. Sometimes the right move is to be the person who did nothing, loudly."
    "You sit on the stair until the bell stops ringing. Nobody opens the vault, and nobody blames you."
    jump scene5_calibration

label scene4_reading:
    show voss soft at right with dissolve
    voss "You are reading it in this weather? Keeper Aldous would have approved. He never finished a line of it either."
    if calibration_drift > 0:
        $ calibration_drift -= 1
        "The margins steady your hands. The drift you carried up the stair feels a little lighter."
    else:
        "The margins steady your hands, even though your hands were never the problem."
    jump scene5_calibration

## Scene 5, the lens ###########################################################

label scene5_calibration:
    scene bg lens with fade
    "The lens gallery is a ring of glass at the top of the tower, with a brass hood that turns on a single bearing."
    "At the center, the Glass Meridian waits. A line of light the width of a hair crosses it. That line is what you have to set."
    show mira calm at left with dissolve
    show soren guarded at right with dissolve
    mira "The stars are in position. The tide is in position. All that is left is us."
    menu:
        "There is time for exactly one calibration. How do you set the Glass Meridian?"

        "Calibrate by the book, one prism at a time." if lens_unlocked:
            jump scene5_book

        "Calibrate quickly, because the storm window is closing." if lens_unlocked:
            jump scene5_quick

        "Share the lens tables with Soren and the harbor council." if lens_unlocked and trust_score >= 2:
            jump scene5_accord

        "Leave the lens dark, and give the key back.":
            jump scene5_dark

label scene5_book:
    "You set each prism and wait for the line to settle before touching the next. It takes four hours and feels like one breath."
    mira "That is the slowest I have ever watched anyone work. It is also the first time the line has not trembled."
    jump scene6_dawn

label scene5_quick:
    $ calibration_drift += 2
    "You set the prisms in a rush, trusting the numbers and not the glass. The line holds, mostly."
    soren "That note. Do you hear that? A very high note."
    show mira worried
    mira "Keeper Aldous heard it too."
    jump scene6_dawn

label scene5_accord:
    $ accord_signed = True
    "You lay the calibration tables open on the bench and invite Soren to read them with you. For a long minute nobody speaks."
    show soren open
    soren "A shared set of tables. The guild will complain and the harbor will thank us. I can live with both."
    jump scene6_dawn

label scene5_dark:
    $ lens_unlocked = False
    "You close your hand over the key, and then you put it back in the lectern where it came from."
    show mira worried
    mira "You are sure? The harbor will drift."
    "You are not sure. But a lens that is set badly drifts faster than a lens that is not set at all."
    jump scene6_dawn

## Scene 6, dawn, and the router that picks the ending #########################

label scene6_dawn:
    scene bg dawn with fade
    "The storm leaves the way it came, without announcing itself. The sea goes still and the sky behind the tower turns the color of an old coin."
    "The tide book is open on the rail where Mira left it. The ledger says drift is [calibration_drift]. The trust column says [trust_score]."
    if not lens_unlocked:
        jump ending_silent_observatory
    elif calibration_drift >= 3:
        jump ending_glass_fracture
    elif accord_signed:
        jump ending_tidal_accord
    elif calibration_drift <= 1 and trust_score >= 3:
        jump ending_meridian_restored
    else:
        jump ending_tidal_accord

## Endings #####################################################################

label ending_meridian_restored:
    $ persistent.ending_meridian_restored = True
    show mira smile at left with dissolve
    show voss soft at right with dissolve
    "The beam goes out over the harbor in one clean line, and every ship's table agrees with every ship's clock."
    mira "I wrote the first entry in a new book. It says the water did what the almanac promised."
    voss "In a hundred years, someone will open that book and think it dull. That is the highest praise this archive has."
    "Ending 1 of 4. Meridian Restored."
    return

label ending_silent_observatory:
    $ persistent.ending_silent_observatory = True
    show mira calm at left with dissolve
    "The lens stays dark. The harbor tables drift a finger a day, which is slower than anyone feared and faster than anyone likes."
    mira "We will teach the pilots to read the water, not the table. It will take years. It will also be true."
    "Ending 2 of 4. Silent Observatory."
    return

label ending_tidal_accord:
    $ persistent.ending_tidal_accord = True
    show soren open at right with dissolve
    show mira calm at left with dissolve
    "The lens turns half a degree off true, and the half degree is written down in three languages and signed by three hands."
    soren "Calibrated by the harbor and the guild together. Neither of us will love it. Both of us will use it."
    mira "A good compromise is one where everyone is a little embarrassed. We are all a little embarrassed."
    "Ending 3 of 4. Tidal Accord."
    return

label ending_glass_fracture:
    $ persistent.ending_glass_fracture = True
    show mira worried at left with dissolve
    show voss grave at right with dissolve
    "At the first full moon the glass sings a high note nobody can place, and then it splits along the line you rushed."
    voss "I told you what the key costs. I did not say it would be this exact bill."
    mira "The pieces are still beautiful. That is the worst part."
    "Ending 4 of 4. Glass Fracture."
    return
