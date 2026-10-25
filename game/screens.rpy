## screens.rpy
##
## The interface for The Glass Meridian, written for Ren'Py 8. Every panel is a
## flat Solid color from gui.rpy, so no gui image files are needed.

init offset = -1

## Base styles ##################################################################

style default:
    font gui.text_font
    size gui.text_size
    color gui.text_color
    outlines []

style input:
    color gui.copper
    adjust_spacing False

style hyperlink_text:
    color gui.copper
    hover_underline True

style gui_text:
    font gui.interface_text_font
    size gui.interface_text_size
    color gui.interface_text_color

style button:
    background None
    padding (8, 4, 8, 4)

style button_text is gui_text:
    color gui.idle_color
    hover_color gui.hover_color
    selected_color gui.selected_color
    insensitive_color gui.insensitive_color
    yalign 0.5

style label_text is gui_text:
    size gui.label_text_size
    color gui.copper

style prompt_text is gui_text:
    color gui.ink

style bar:
    ysize 24
    left_bar Solid(gui.teal)
    right_bar Solid("#CFC8B6")

style vbar:
    xsize 24
    top_bar Solid("#CFC8B6")
    bottom_bar Solid(gui.teal)

style scrollbar:
    ysize 16
    base_bar Solid("#CFC8B6")
    thumb Solid(gui.teal)

style vscrollbar:
    xsize 16
    base_bar Solid("#CFC8B6")
    thumb Solid(gui.teal)

style slider:
    ysize 24
    base_bar Solid("#CFC8B6")
    thumb Solid(gui.copper)
    thumb_offset 0

style frame:
    padding (24, 24)
    background Solid(gui.stage)

## Dialogue #####################################################################

screen say(who, what):
    style_prefix "say"

    window:
        id "window"

        if who is not None:
            window:
                id "namebox"
                style "namebox"
                text who id "who"

        text what id "what"

style window is default
style say_label is default
style say_dialogue is default
style say_thought is say_dialogue
style namebox is default
style namebox_label is say_label

style window:
    xalign 0.5
    xfill True
    yalign 1.0
    ysize gui.textbox_height
    background Solid("#EAE4DCF2")

style namebox:
    xpos gui.name_xpos
    xanchor 0.0
    ypos gui.name_ypos
    xminimum 280
    ysize 62
    padding (30, 8, 30, 8)
    background Solid(gui.parchment)

style say_label:
    font gui.name_text_font
    size gui.name_text_size
    color gui.accent_color
    yalign 0.5

style say_dialogue:
    xpos gui.text_xpos
    xsize gui.text_width
    ypos gui.text_ypos
    color gui.ink

## Input ########################################################################

screen input(prompt):
    style_prefix "input"

    window:
        vbox:
            xanchor 0.5
            xpos 0.5
            ypos 0.4
            spacing 20
            text prompt style "input_prompt"
            input id "input"

style input_prompt is default

style input_prompt:
    xalign 0.5

## Choice menu ##################################################################

screen choice(items):
    style_prefix "choice"

    vbox:
        for i in items:
            textbutton i.caption action i.action

style choice_vbox is vbox
style choice_button is button
style choice_button_text is button_text

style choice_vbox:
    xalign 0.5
    ypos 380
    yanchor 0.5
    spacing gui.choice_spacing

style choice_button:
    xsize gui.choice_button_width
    xalign 0.5
    padding (36, 22, 36, 22)
    background Solid("#F5F2EAF0")
    hover_background Solid(gui.copper)

style choice_button_text:
    xalign 0.5
    text_align 0.5
    color gui.ink
    hover_color gui.parchment
    size 36

## Quick menu ###################################################################

screen quick_menu():
    zorder 100

    if quick_menu:
        hbox:
            style_prefix "quick"
            xalign 0.5
            yalign 1.0
            spacing 28

            textbutton _("Back") action Rollback()
            textbutton _("History") action ShowMenu("history")
            textbutton _("Skip") action Skip() alternate Skip(fast=True, confirm=True)
            textbutton _("Auto") action Preference("auto-forward", "toggle")
            textbutton _("Save") action ShowMenu("save")
            textbutton _("Menu") action ShowMenu("preferences")

init python:
    config.overlay_screens.append("quick_menu")

default quick_menu = True

style quick_menu is hbox
style quick_button is default
style quick_button_text is button_text

style quick_button:
    padding (14, 6, 14, 10)

style quick_button_text:
    size 26
    color gui.muted
    hover_color gui.copper
    selected_color gui.teal

## Navigation ###################################################################

screen navigation():
    vbox:
        style_prefix "navigation"
        xpos 90
        yalign 0.5
        spacing 22

        if main_menu:
            textbutton _("New Expedition") action Start()
        else:
            textbutton _("History") action ShowMenu("history")
            textbutton _("Save") action ShowMenu("save")

        textbutton _("Continue Slot") action ShowMenu("load")
        textbutton _("Ending Gallery") action ShowMenu("ending_gallery")
        textbutton _("Preferences") action ShowMenu("preferences")

        if _in_replay:
            textbutton _("End Replay") action EndReplay(confirm=True)
        elif not main_menu:
            textbutton _("Main Menu") action MainMenu()

        textbutton _("About") action ShowMenu("about")

        if renpy.variant("pc"):
            textbutton _("Quit") action Quit(confirm=not main_menu)

style navigation_button is button
style navigation_button_text is button_text

style navigation_button:
    xsize 520
    padding (6, 4, 6, 4)

style navigation_button_text:
    font gui.name_text_font
    size 42
    color gui.parchment
    hover_color "#E9A27A"
    selected_color "#E9A27A"

## Main menu ####################################################################

screen main_menu():
    tag menu

    add Solid(gui.ink)
    add "images/bg_dawn.svg"

    frame:
        style "main_menu_frame"

    use navigation

    vbox:
        style "main_menu_title_box"
        text "The Glass Meridian" style "main_menu_title"
        text "A visual novel in six scenes and four endings" style "main_menu_subtitle"
        text "Hack Club Storyboard" style "main_menu_subtitle"

style main_menu_frame is empty
style main_menu_title_box is vbox
style main_menu_title is gui_text
style main_menu_subtitle is gui_text

style main_menu_frame:
    xsize 760
    yfill True
    background Solid("#14181DE0")

style main_menu_title_box:
    xpos 900
    yalign 0.88
    spacing 12

style main_menu_title:
    font gui.name_text_font
    size gui.title_text_size
    color gui.parchment
    outlines [ (3, "#14181D", 0, 0) ]

style main_menu_subtitle:
    size 34
    color gui.parchment
    outlines [ (2, "#14181D", 0, 0) ]

## Game menu ####################################################################

screen game_menu(title, scroll=None, yinitial=0.0, spacing=0):
    style_prefix "game_menu"

    add Solid(gui.parchment)

    frame:
        style "game_menu_outer_frame"

        hbox:
            frame:
                style "game_menu_navigation_frame"

            frame:
                style "game_menu_content_frame"

                if scroll == "viewport":
                    viewport:
                        yinitial yinitial
                        scrollbars "vertical"
                        mousewheel True
                        draggable True
                        pagekeys True
                        side_yfill True

                        vbox:
                            spacing spacing
                            transclude

                elif scroll == "vpgrid":
                    vpgrid:
                        cols 1
                        yinitial yinitial
                        scrollbars "vertical"
                        mousewheel True
                        draggable True
                        pagekeys True
                        side_yfill True
                        spacing spacing
                        transclude

                else:
                    transclude

    use navigation

    textbutton _("Return"):
        style "return_button"
        action Return()

    label title

    if main_menu:
        key "game_menu" action ShowMenu("main_menu")

style game_menu_outer_frame is empty
style game_menu_navigation_frame is empty
style game_menu_content_frame is empty
style game_menu_viewport is vpgrid
style game_menu_label is gui_text
style game_menu_label_text is label_text
style return_button is navigation_button
style return_button_text is navigation_button_text

style game_menu_outer_frame:
    bottom_padding 60
    top_padding 150
    background None

style game_menu_navigation_frame:
    xsize 760
    yfill True
    background Solid("#14181DF5")

style game_menu_content_frame:
    left_margin 60
    right_margin 40
    top_margin 10
    background None

style game_menu_viewport:
    xsize 1020

style game_menu_label:
    xpos 820
    ysize 130
    yalign 0.5

style game_menu_label_text:
    size 64
    color gui.teal
    yalign 0.5

style return_button:
    xpos 90
    yalign 1.0
    yoffset -60

style return_button_text:
    size 34
    color "#E9A27A"
    hover_color gui.parchment

## About ########################################################################

screen about():
    tag menu

    use game_menu(_("About"), scroll="viewport"):
        style_prefix "about"

        vbox:
            spacing 20
            label "[config.name!t]"
            text _("Version [config.version!t]")
            if gui.about:
                text "[gui.about!t]"

style about_label is gui_text
style about_label_text is label_text
style about_text is gui_text

style about_text:
    size 30
    xsize 940

## Ending gallery ###############################################################
## Reads the persistent flags that each ending label sets.

define ending_entries = [
    ("ending_meridian_restored", "Meridian Restored", "The lens is set true and every tide table agrees with the water."),
    ("ending_silent_observatory", "Silent Observatory", "The lens stays dark. The harbor learns to read the water instead."),
    ("ending_tidal_accord", "Tidal Accord", "The harbor and the guild calibrate the lens together, a little off true."),
    ("ending_glass_fracture", "Glass Fracture", "A rushed line, a high note, and a split in the century."),
]

screen ending_gallery():
    tag menu

    $ found = len([e for e in ending_entries if getattr(persistent, e[0])])

    use game_menu(_("Ending Gallery"), scroll="viewport"):
        vbox:
            spacing 34
            text _("Endings found: [found] of 4") size 34 color gui.muted

            for key, title, hint in ending_entries:
                vbox:
                    spacing 6
                    if getattr(persistent, key):
                        text title size 46 color gui.teal font gui.name_text_font
                        text hint size 30 color gui.ink xsize 940
                    else:
                        text _("Not found yet") size 46 color gui.insensitive_color font gui.name_text_font
                        text _("Keep choosing differently. Mira, Soren and Voss remember how you treat them.") size 30 color gui.muted xsize 940

## Load and save ################################################################

screen save():
    tag menu
    use file_slots(_("Save"))

screen load():
    tag menu
    use file_slots(_("Continue Slot"))

screen file_slots(title):
    default page_name_value = FilePageNameInputValue(pattern=_("Page {}"), auto=_("Automatic saves"), quick=_("Quick saves"))

    use game_menu(title):
        fixed:
            order_reverse True

            button:
                style "page_label"
                key_events True
                xalign 0.5
                action page_name_value.Toggle()

                input:
                    style "page_label_text"
                    value page_name_value

            grid 3 2:
                style_prefix "slot"
                xalign 0.5
                yalign 0.5
                spacing 22

                for i in range(6):
                    $ slot = i + 1

                    button:
                        action FileAction(slot)
                        has vbox
                        add FileScreenshot(slot) xalign 0.5
                        text FileTime(slot, format=_("{#file_time}%A, %B %d %Y, %H:%M"), empty=_("empty slot")):
                            style "slot_time_text"
                        text FileSaveName(slot):
                            style "slot_name_text"
                        key "save_delete" action FileDelete(slot)

            vbox:
                style_prefix "page"
                xalign 0.5
                yalign 1.0

                hbox:
                    xalign 0.5
                    spacing 10

                    if config.has_autosave:
                        textbutton _("{#auto_page}A") action FilePage("auto")
                    if config.has_quicksave:
                        textbutton _("{#quick_page}Q") action FilePage("quick")
                    for page in range(1, 6):
                        textbutton "[page]" action FilePage(page)

style page_label is gui_text
style page_label_text is label_text
style page_button is button
style page_button_text is button_text
style slot_button is button
style slot_button_text is button_text
style slot_time_text is slot_button_text
style slot_name_text is slot_button_text

style page_label:
    xpadding 60
    ypadding 8

style page_label_text:
    text_align 0.5
    layout "subtitle"
    hover_color gui.copper

style page_button:
    padding (10, 4, 10, 4)

style page_button_text:
    size 30

style slot_button:
    xsize 330
    padding (8, 8, 8, 8)
    background Solid(gui.stage)
    hover_background Solid("#DCD3BE")

style slot_button_text:
    size 22
    color gui.ink
    hover_color gui.copper

style slot_time_text:
    xalign 0.5

style slot_name_text:
    xalign 0.5

## Preferences ##################################################################

screen preferences():
    tag menu

    use game_menu(_("Preferences"), scroll="viewport"):
        vbox:
            spacing 40

            hbox:
                box_wrap True

                if renpy.variant("pc") or renpy.variant("web"):
                    vbox:
                        style_prefix "radio"
                        label _("Display")
                        textbutton _("Window") action Preference("display", "window")
                        textbutton _("Fullscreen") action Preference("display", "fullscreen")

                vbox:
                    style_prefix "check"
                    label _("Skip")
                    textbutton _("Unseen Text") action Preference("skip", "toggle")
                    textbutton _("After Choices") action Preference("after choices", "toggle")

            vbox:
                style_prefix "slider"
                label _("Text Speed")
                bar value Preference("text speed")
                label _("Auto-Forward Time")
                bar value Preference("auto-forward time")

style pref_label is gui_text
style pref_label_text is label_text
style pref_vbox is vbox
style radio_label is pref_label
style radio_label_text is pref_label_text
style radio_button is button
style radio_button_text is button_text
style radio_vbox is pref_vbox
style check_label is pref_label
style check_label_text is pref_label_text
style check_button is button
style check_button_text is button_text
style check_vbox is pref_vbox
style slider_label is pref_label
style slider_label_text is pref_label_text
style slider_slider is slider
style slider_vbox is pref_vbox

style pref_label:
    top_margin 12
    bottom_margin 6

style pref_vbox:
    xsize 460

style radio_vbox:
    spacing 6

style radio_button:
    padding (8, 4, 8, 4)

style check_vbox:
    spacing 6

style check_button:
    padding (8, 4, 8, 4)

style slider_slider:
    xsize 760

style slider_vbox:
    xsize 900

## History ######################################################################

screen history():
    tag menu

    predict False

    use game_menu(_("History"), scroll=("vpgrid" if gui.history_height else "viewport"), yinitial=1.0, spacing=gui.history_spacing):
        style_prefix "history"

        for h in _history_list:
            window:
                has fixed:
                    yfit True

                if h.who:
                    label h.who:
                        style "history_name"
                        substitute False
                        if "color" in h.who_args:
                            text_color h.who_args["color"]

                $ what = renpy.filter_text_tags(h.what, allow=gui.history_allow_tags)
                text what:
                    substitute False

        if not _history_list:
            label _("The history is empty.")

define gui.history_allow_tags = { "alt", "noalt", "rt", "rb", "art" }
define gui.history_height = None
define gui.history_spacing = 20

style history_window is empty
style history_name is gui_text
style history_name_text is label_text
style history_text is gui_text
style history_label is gui_text
style history_label_text is label_text

style history_window:
    xfill True
    ysize 150

style history_name:
    xpos 0
    xsize 220
    ysize 150

style history_name_text:
    min_width 220
    text_align 0.0
    size 30

style history_text:
    xpos 240
    ypos 4
    xsize 760
    min_width 760
    text_align 0.0
    layout "subtitle"
    size 30

style history_label:
    xfill True

style history_label_text:
    xalign 0.5

## Confirm ######################################################################

screen confirm(message, yes_action, no_action):
    modal True
    zorder 200
    style_prefix "confirm"

    add Solid("#14181DCC")

    frame:
        vbox:
            xalign 0.5
            yalign 0.5
            spacing 40

            label _(message):
                style "confirm_prompt"
                xalign 0.5

            hbox:
                xalign 0.5
                spacing 100

                textbutton _("Yes") action yes_action
                textbutton _("No") action no_action

    key "game_menu" action no_action

style confirm_frame is frame
style confirm_prompt is gui_text
style confirm_prompt_text is label_text
style confirm_button is button
style confirm_button_text is button_text

style confirm_frame:
    padding (80, 60, 80, 60)
    xalign 0.5
    yalign 0.5
    background Solid(gui.parchment)

style confirm_prompt_text:
    text_align 0.5
    layout "subtitle"
    color gui.ink

style confirm_button_text:
    size 40

## Skip and notify ##############################################################

screen skip_indicator():
    zorder 100
    style_prefix "skip"

    frame:
        hbox:
            spacing 10
            text _("Skipping")
            text "▸" at delayed_blink(0.0, 1.0) style "skip_triangle"
            text "▸" at delayed_blink(0.2, 1.0) style "skip_triangle"
            text "▸" at delayed_blink(0.4, 1.0) style "skip_triangle"

transform delayed_blink(delay, cycle):
    alpha .5

    pause delay
    block:
        linear .2 alpha 1.0
        pause .2
        linear .2 alpha 0.5
        pause (cycle - .4)
        repeat

style skip_frame is empty
style skip_text is gui_text
style skip_triangle is skip_text

style skip_frame:
    ypos 20
    xpos 20
    padding (24, 10, 24, 10)
    background Solid(gui.copper)

style skip_text:
    size 26
    color gui.parchment

style skip_triangle:
    font "DejaVuSans.ttf"

screen notify(message):
    zorder 100
    style_prefix "notify"

    frame at notify_appear:
        text "[message!tq]"

    timer 3.25 action Hide('notify')

transform notify_appear:
    on show:
        alpha 0
        linear .25 alpha 1.0
    on hide:
        linear .5 alpha 0.0

style notify_frame is empty
style notify_text is gui_text

style notify_frame:
    ypos 20
    padding (24, 10, 24, 10)
    background Solid(gui.teal)

style notify_text:
    size 26
    color gui.parchment
