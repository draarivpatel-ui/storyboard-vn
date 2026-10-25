## options.rpy
##
## Basic options for The Glass Meridian. Lines that start with two # marks are
## comments. Everything here uses plain Ren'Py 8 settings.

define config.name = _("The Glass Meridian")

## The title is drawn by our own main menu screen, so the default is switched off.
define gui.show_name = False

define config.version = "1.0.0"

define gui.about = _p("""
A short visual novel, set at a coastal observatory on the night of the Long Tide.

Three characters, six scenes, four endings. Your choices move trust_score, calibration_drift and lens_unlocked, and those three numbers decide how the century ends.

The same script.rpy also runs in a browser with a story graph verifier. See README.md and NOTES.md for how.

Art and code are procedural and AI-assisted. Both are disclosed in NOTES.md.
""")

define build.name = "GlassMeridian"

## Audio is not used in this game, so the mixers stay hidden.
define config.has_sound = False
define config.has_music = False
define config.has_voice = False

## Transitions ##################################################################
define config.enter_transition = dissolve
define config.exit_transition = dissolve
define config.intra_transition = dissolve
define config.after_load_transition = None
define config.end_game_transition = fade

## Window management ############################################################
define config.window = "auto"
define config.window_show_transition = Dissolve(.2)
define config.window_hide_transition = Dissolve(.2)

## Preference defaults ##########################################################
default preferences.text_cps = 0
default preferences.afm_time = 15

## Saving #######################################################################
define config.save_directory = "glass-meridian-1"
define config.thumbnail_width = 384
define config.thumbnail_height = 216
define config.has_autosave = True
define config.autosave_on_quit = True
define config.autosave_on_choice = True
define config.rollback_enabled = True
define config.rollback_length = 200

## Build ########################################################################
init python:
    build.classify('**~', None)
    build.classify('**.bak', None)
    build.classify('**/.**', None)
    build.classify('**/#**', None)
    build.classify('**/thumbs.db', None)
    build.documentation('*.txt')
    build.documentation('*.md')
