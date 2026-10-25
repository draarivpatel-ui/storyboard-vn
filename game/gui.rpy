## gui.rpy
##
## Design tokens for the desktop interface. The browser build uses the same
## palette in styles.css. Nothing here needs image files: every panel and button
## is a flat color, so the project runs as soon as it is opened in Ren'Py 8.

init offset = -2

init python:
    gui.init(1920, 1080)

define config.check_conflicting_properties = True

## Palette ######################################################################
define gui.parchment = "#F5F2EA"
define gui.stage = "#EAE4D6"
define gui.ink = "#14181D"
define gui.copper = "#B4532A"
define gui.teal = "#1E5E63"
define gui.muted = "#6B665B"

define gui.accent_color = gui.copper
define gui.idle_color = gui.ink
define gui.idle_small_color = gui.muted
define gui.hover_color = gui.copper
define gui.selected_color = gui.teal
define gui.insensitive_color = "#8A867B"
define gui.text_color = gui.ink
define gui.interface_text_color = gui.ink

## Fonts ########################################################################
## DejaVu Sans ships with Ren'Py, so no font files are added to this repository.
define gui.text_font = "DejaVuSans.ttf"
define gui.name_text_font = "DejaVuSans-Bold.ttf"
define gui.interface_text_font = "DejaVuSans.ttf"

define gui.text_size = 38
define gui.name_text_size = 40
define gui.interface_text_size = 32
define gui.label_text_size = 40
define gui.title_text_size = 108

## Dialogue #####################################################################
define gui.textbox_height = 270
define gui.text_xpos = 300
define gui.text_ypos = 84
define gui.text_width = 1320
define gui.name_xpos = 280
define gui.name_ypos = -28

## Choices ######################################################################
define gui.choice_button_width = 1180
define gui.choice_spacing = 24
